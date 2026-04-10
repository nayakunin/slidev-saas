import { v } from "convex/values";

import { EXPORT_PIPELINE_VERSION, type ExportFormat } from "../export-contract";
import { exportFormatValidator } from "./schema";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ensureProjectOwner, requireProjectAccess, requireIdentity } from "./auth";
import { exportPool } from "./exportWorkpool";
import { getFileByPath, sha256Hex } from "./lib";

function isTerminalStatus(status: Doc<"exportJobs">["status"]) {
  return status === "succeeded" || status === "failed";
}

function toErrorMessage(value: unknown) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (value instanceof Error && value.message.length > 0) {
    return value.message;
  }

  return "Export dispatch failed.";
}

async function getProjectFiles(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  projectId: Id<"projects">,
) {
  return await ctx.db
    .query("projectFiles")
    .withIndex("by_project_path", (query) => query.eq("projectId", projectId))
    .collect();
}

async function computeFingerprint({
  format,
  project,
  files,
}: {
  format: ExportFormat;
  project: Doc<"projects">;
  files: Array<Doc<"projectFiles">>;
}) {
  return await sha256Hex(
    JSON.stringify({
      entryFilePath: project.entryFilePath,
      format,
      pipelineVersion: EXPORT_PIPELINE_VERSION,
      templateVersion: project.templateVersion,
      files: [...files]
        .sort((left, right) => left.path.localeCompare(right.path))
        .map((file) => ({
          path: file.path,
          kind: file.kind,
          mimeType: file.mimeType ?? null,
          sha256: file.sha256,
          sizeBytes: file.sizeBytes,
        })),
    }),
  );
}

async function getCache(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  projectId: Id<"projects">,
  format: ExportFormat,
) {
  return await ctx.db
    .query("exportCaches")
    .withIndex("by_projectId_and_format", (query) =>
      query.eq("projectId", projectId).eq("format", format),
    )
    .unique();
}

async function getActiveJob(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  projectId: Id<"projects">,
  format: ExportFormat,
  fingerprint: string,
) {
  const jobs = await ctx.db
    .query("exportJobs")
    .withIndex("by_projectId_and_format_and_fingerprint", (query) =>
      query.eq("projectId", projectId).eq("format", format).eq("fingerprint", fingerprint),
    )
    .collect();

  return jobs
    .sort((left, right) => right._creationTime - left._creationTime)
    .find((job) => !isTerminalStatus(job.status));
}

export const getPreparedRequest = internalQuery({
  args: {
    projectId: v.id("projects"),
    format: exportFormatValidator,
  },
  handler: async (ctx, args) => {
    const { project } = await requireProjectAccess(ctx, args.projectId);
    const files = await getProjectFiles(ctx, args.projectId);
    const fingerprint = await computeFingerprint({
      format: args.format,
      project,
      files,
    });
    const cache = await getCache(ctx, args.projectId, args.format);
    const activeJob = await getActiveJob(ctx, args.projectId, args.format, fingerprint);

    return {
      activeJobId: activeJob?._id ?? null,
      cache:
        cache && cache.fingerprint === fingerprint
          ? {
              cacheId: cache._id,
              bucketKey: cache.bucketKey,
              fileName: cache.fileName,
              fingerprint: cache.fingerprint,
              mimeType: cache.mimeType,
            }
          : null,
      fingerprint,
    };
  },
});

export const ensureQueuedJob = internalMutation({
  args: {
    projectId: v.id("projects"),
    format: exportFormatValidator,
    fingerprint: v.string(),
  },
  handler: async (ctx, args) => {
    const { identity, project } = await requireProjectAccess(ctx, args.projectId);
    await ensureProjectOwner(ctx, project, identity.tokenIdentifier);

    const existingJob = await getActiveJob(ctx, args.projectId, args.format, args.fingerprint);

    if (existingJob) {
      return {
        jobId: existingJob._id,
        shouldDispatch: false,
      };
    }

    const now = Date.now();
    const jobId = await ctx.db.insert("exportJobs", {
      projectId: args.projectId,
      ownerTokenIdentifier: identity.tokenIdentifier,
      format: args.format,
      fingerprint: args.fingerprint,
      pipelineVersion: EXPORT_PIPELINE_VERSION,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });

    return {
      jobId,
      shouldDispatch: true,
    };
  },
});

export const recordWorkId = internalMutation({
  args: {
    jobId: v.id("exportJobs"),
    workId: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);

    if (!job) {
      return;
    }

    await ctx.db.patch(args.jobId, {
      workId: args.workId,
      updatedAt: Date.now(),
    });
  },
});

export const getDispatchPayload = internalQuery({
  args: {
    jobId: v.id("exportJobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);

    if (!job || job.status === "succeeded") {
      return null;
    }

    const project = await ctx.db.get(job.projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    const entryFile = await getFileByPath(ctx, job.projectId, project.entryFilePath);

    if (!entryFile || entryFile.kind !== "text") {
      throw new Error("Entry file not found.");
    }

    const files = await getProjectFiles(ctx, job.projectId);

    return {
      entryFilePath: project.entryFilePath,
      files: await Promise.all(
        files
          .sort((left, right) => left.path.localeCompare(right.path))
          .map(async (file) => ({
            path: file.path,
            kind: file.kind,
            mimeType: file.mimeType ?? null,
            textContent: file.kind === "text" ? (file.textContent ?? "") : null,
            downloadUrl: file.storageId ? await ctx.storage.getUrl(file.storageId) : null,
            sha256: file.sha256,
          })),
      ),
      fingerprint: job.fingerprint,
      format: job.format,
      jobId: job._id,
      pipelineVersion: job.pipelineVersion,
      projectId: job.projectId,
      projectTitle: project.title,
    };
  },
});

export const markDispatching = internalMutation({
  args: {
    jobId: v.id("exportJobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);

    if (!job || isTerminalStatus(job.status)) {
      return;
    }

    await ctx.db.patch(args.jobId, {
      status: "dispatching",
      updatedAt: Date.now(),
    });
  },
});

export const markDispatchRejected = internalMutation({
  args: {
    jobId: v.id("exportJobs"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);

    if (!job || job.status === "succeeded") {
      return;
    }

    await ctx.db.patch(args.jobId, {
      status: "failed",
      errorMessage: args.errorMessage,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const handleDispatchCompletion = exportPool.defineOnComplete({
  context: v.object({
    jobId: v.id("exportJobs"),
  }),
  handler: async (ctx, args) => {
    if (args.result.kind === "success") {
      return;
    }

    const job = await ctx.db.get(args.context.jobId);

    if (!job || job.status === "rendering" || job.status === "succeeded") {
      return;
    }

    await ctx.db.patch(args.context.jobId, {
      status: "failed",
      errorMessage:
        args.result.kind === "failed"
          ? toErrorMessage(args.result.error)
          : "Export dispatch canceled.",
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

const callbackStatusValidator = v.union(
  v.literal("rendering"),
  v.literal("succeeded"),
  v.literal("failed"),
);

export const applyExporterCallback = internalMutation({
  args: {
    jobId: v.id("exportJobs"),
    status: callbackStatusValidator,
    errorMessage: v.optional(v.string()),
    bucketKey: v.optional(v.string()),
    etag: v.optional(v.string()),
    fileName: v.optional(v.string()),
    fingerprint: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);

    if (!job) {
      throw new Error("Export job not found.");
    }

    const now = Date.now();

    if (args.status === "rendering") {
      if (job.status !== "succeeded") {
        await ctx.db.patch(args.jobId, {
          status: "rendering",
          updatedAt: now,
        });
      }

      return { oldBucketKey: null };
    }

    if (args.status === "failed") {
      if (job.status !== "succeeded") {
        await ctx.db.patch(args.jobId, {
          status: "failed",
          errorMessage: args.errorMessage ?? "Export failed.",
          completedAt: now,
          updatedAt: now,
        });
      }

      return { oldBucketKey: null };
    }

    if (
      !args.bucketKey ||
      !args.fileName ||
      !args.fingerprint ||
      !args.mimeType ||
      args.sizeBytes === undefined
    ) {
      throw new Error("Exporter success callback is incomplete.");
    }

    if (args.fingerprint !== job.fingerprint) {
      throw new Error("Exporter fingerprint mismatch.");
    }

    const existingCache = await getCache(ctx, job.projectId, job.format);
    let cacheId = existingCache?._id ?? null;
    const oldBucketKey =
      existingCache && existingCache.bucketKey !== args.bucketKey ? existingCache.bucketKey : null;

    if (existingCache) {
      await ctx.db.patch(existingCache._id, {
        ownerTokenIdentifier: job.ownerTokenIdentifier,
        fingerprint: args.fingerprint,
        pipelineVersion: job.pipelineVersion,
        bucketKey: args.bucketKey,
        fileName: args.fileName,
        mimeType: args.mimeType,
        sizeBytes: args.sizeBytes,
        etag: args.etag ?? undefined,
        updatedAt: now,
      });
    } else {
      cacheId = await ctx.db.insert("exportCaches", {
        projectId: job.projectId,
        ownerTokenIdentifier: job.ownerTokenIdentifier,
        format: job.format,
        fingerprint: args.fingerprint,
        pipelineVersion: job.pipelineVersion,
        bucketKey: args.bucketKey,
        fileName: args.fileName,
        mimeType: args.mimeType,
        sizeBytes: args.sizeBytes,
        etag: args.etag ?? undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.jobId, {
      cacheId: cacheId ?? undefined,
      completedAt: now,
      errorMessage: undefined,
      status: "succeeded",
      updatedAt: now,
    });

    return { oldBucketKey };
  },
});

export const getDownloadTarget = internalQuery({
  args: {
    projectId: v.id("projects"),
    format: exportFormatValidator,
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    return await getCache(ctx, args.projectId, args.format);
  },
});

export const getExportStatus = query({
  args: {
    jobId: v.id("exportJobs"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const job = await ctx.db.get(args.jobId);

    if (!job || job.ownerTokenIdentifier !== identity.tokenIdentifier) {
      return null;
    }

    return {
      cacheId: job.cacheId ?? null,
      completedAt: job.completedAt ?? null,
      errorMessage: job.errorMessage ?? null,
      format: job.format,
      jobId: job._id,
      status: job.status,
      updatedAt: job.updatedAt,
    };
  },
});
