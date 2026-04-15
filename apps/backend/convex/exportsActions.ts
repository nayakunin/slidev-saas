"use node";

import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v } from "convex/values";

import type { ExportJobSubmission } from "../export-contract";
import { exportFormatValidator } from "./schema";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { getExportEnv } from "./exportEnv";
import { exportPool } from "./exportWorkpool";

interface PreparedRequestResult {
  activeJobId: Id<"exportJobs"> | null;
  cache: {
    cacheId: Id<"exportCaches">;
    bucketKey: string;
    fileName: string;
    fingerprint: string;
    mimeType: string;
  } | null;
  fingerprint: string;
}

interface EnsureQueuedJobResult {
  jobId: Id<"exportJobs">;
  shouldDispatch: boolean;
}

function getS3Client() {
  const env = getExportEnv();

  return new S3Client({
    region: env.EXPORTER_BUCKET_REGION,
    endpoint: env.EXPORTER_BUCKET_ENDPOINT,
    forcePathStyle: env.EXPORTER_BUCKET_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.EXPORTER_BUCKET_ACCESS_KEY_ID,
      secretAccessKey: env.EXPORTER_BUCKET_SECRET_ACCESS_KEY,
    },
  });
}

function toAttachmentDisposition(fileName: string) {
  const escapedFileName = fileName.replace(/"/g, "");
  return `attachment; filename="${escapedFileName}"`;
}

async function signDownloadUrl({
  bucketKey,
  fileName,
  mimeType,
}: {
  bucketKey: string;
  fileName: string;
  mimeType: string;
}) {
  const env = getExportEnv();
  const client = getS3Client();

  return await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: env.EXPORTER_BUCKET_NAME,
      Key: bucketKey,
      ResponseContentDisposition: toAttachmentDisposition(fileName),
      ResponseContentType: mimeType,
    }),
    { expiresIn: env.EXPORT_URL_EXPIRES_SECONDS },
  );
}

export const requestExport = action({
  args: {
    projectId: v.id("projects"),
    format: exportFormatValidator,
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { kind: "ready"; cacheId: Id<"exportCaches">; downloadUrl: string }
    | { kind: "queued"; jobId: Id<"exportJobs"> }
  > => {
    const prepared: PreparedRequestResult = await ctx.runQuery(
      internal.exports.getPreparedRequest,
      args,
    );

    if (prepared.cache) {
      return {
        kind: "ready" as const,
        cacheId: prepared.cache.cacheId,
        downloadUrl: await signDownloadUrl(prepared.cache),
      };
    }

    const job: EnsureQueuedJobResult = await ctx.runMutation(internal.exports.ensureQueuedJob, {
      ...args,
      fingerprint: prepared.fingerprint,
    });

    if (job.shouldDispatch) {
      const workId = await exportPool.enqueueAction(
        ctx,
        internal.exportsActions.dispatchExportJob,
        { jobId: job.jobId },
        {
          context: { jobId: job.jobId },
          onComplete: internal.exports.handleDispatchCompletion,
          retry: true,
        },
      );

      await ctx.runMutation(internal.exports.recordWorkId, {
        jobId: job.jobId,
        workId,
      });
    }

    return {
      kind: "queued" as const,
      jobId: job.jobId,
    };
  },
});

export const getExportDownloadUrl = action({
  args: {
    projectId: v.id("projects"),
    format: exportFormatValidator,
  },
  handler: async (ctx, args): Promise<string> => {
    const cache: Doc<"exportCaches"> | null = await ctx.runQuery(
      internal.exports.getDownloadTarget,
      args,
    );

    if (!cache) {
      throw new Error("Export not found.");
    }

    return await signDownloadUrl(cache);
  },
});

export const dispatchExportJob = internalAction({
  args: {
    jobId: v.id("exportJobs"),
  },
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(internal.exports.getDispatchPayload, args);

    if (!payload) {
      return null;
    }

    const env = getExportEnv();

    await ctx.runMutation(internal.exports.markDispatching, args);

    const response = await fetch(new URL("/jobs", env.EXPORTER_BASE_URL), {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.EXPORTER_SHARED_SECRET}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...payload,
        callbackUrl: `${env.CONVEX_HTTP_BASE_URL.replace(/\/+$/g, "")}/exports/callback`,
      } satisfies ExportJobSubmission),
    });

    if (response.ok || response.status === 409) {
      return null;
    }

    const responseText = (await response.text()).trim();
    const message =
      responseText.length > 0
        ? responseText
        : `Exporter request failed with status ${response.status}.`;

    if (response.status === 429 || response.status >= 500) {
      throw new Error(message);
    }

    await ctx.runMutation(internal.exports.markDispatchRejected, {
      jobId: args.jobId,
      errorMessage: message,
    });

    return null;
  },
});

export const deleteBucketObject = internalAction({
  args: {
    bucketKey: v.string(),
  },
  handler: async (_ctx, args) => {
    const env = getExportEnv();
    const client = getS3Client();

    await client.send(
      new DeleteObjectCommand({
        Bucket: env.EXPORTER_BUCKET_NAME,
        Key: args.bucketKey,
      }),
    );

    return null;
  },
});
