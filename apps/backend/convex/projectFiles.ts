import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireIdentity, requireProjectAccess } from "./auth";
import { buildProjectTree, normalizeProjectPath, type ProjectFileSummary } from "./editor";
import { getFileByPath, MAX_INLINE_TEXT_BYTES, sha256Hex } from "./lib";

function toSummary(doc: {
  path: string;
  kind: "text" | "asset";
  mimeType?: string;
  sizeBytes: number;
  revision: number;
  updatedAt: number;
}): ProjectFileSummary {
  return {
    path: doc.path,
    name: doc.path.slice(doc.path.lastIndexOf("/") + 1),
    kind: doc.kind,
    mimeType: doc.mimeType ?? null,
    sizeBytes: doc.sizeBytes,
    revision: doc.revision,
    updatedAt: doc.updatedAt,
  };
}

export const getProjectTree = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const files = await ctx.db
      .query("projectFiles")
      .withIndex("by_project_path", (query) => query.eq("projectId", args.projectId))
      .collect();

    return buildProjectTree(files.map(toSummary));
  },
});

export const getFile = query({
  args: {
    projectId: v.id("projects"),
    path: v.string(),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const file = await getFileByPath(ctx, args.projectId, args.path);

    if (!file) {
      return null;
    }

    return {
      ...file,
      downloadUrl: file.storageId ? await ctx.storage.getUrl(file.storageId) : null,
    };
  },
});

export const getHydrationFiles = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const files = await ctx.db
      .query("projectFiles")
      .withIndex("by_project_path", (query) => query.eq("projectId", args.projectId))
      .collect();

    return await Promise.all(
      files.map(async (file) => ({
        path: file.path,
        kind: file.kind,
        mimeType: file.mimeType ?? null,
        textContent: file.textContent ?? null,
        storageId: file.storageId ?? null,
        downloadUrl: file.storageId ? await ctx.storage.getUrl(file.storageId) : null,
      })),
    );
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveTextFile = mutation({
  args: {
    projectId: v.id("projects"),
    path: v.string(),
    content: v.string(),
    mimeType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);

    const normalizedPath = normalizeProjectPath(args.path);
    const now = Date.now();
    const sizeBytes = new TextEncoder().encode(args.content).byteLength;

    if (sizeBytes > MAX_INLINE_TEXT_BYTES) {
      throw new Error("Text file is too large to store inline.");
    }

    const existing = await getFileByPath(ctx, args.projectId, normalizedPath);
    const revision = (existing?.revision ?? 0) + 1;
    const sha256 = await sha256Hex(args.content);

    const patch = {
      path: normalizedPath,
      kind: "text" as const,
      mimeType: args.mimeType ?? existing?.mimeType ?? "text/plain",
      sizeBytes,
      sha256,
      revision,
      textContent: args.content,
      storageId: undefined,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("projectFiles", {
        projectId: args.projectId,
        createdAt: now,
        ...patch,
      });
    }

    await ctx.db.patch(args.projectId, {
      updatedAt: now,
    });

    return {
      path: normalizedPath,
      revision,
      sha256,
      sizeBytes,
    };
  },
});

export const createFile = mutation({
  args: {
    projectId: v.id("projects"),
    path: v.string(),
    content: v.optional(v.string()),
    mimeType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const normalizedPath = normalizeProjectPath(args.path);
    const existing = await getFileByPath(ctx, args.projectId, normalizedPath);

    if (existing) {
      throw new Error("A file already exists at that path.");
    }

    const now = Date.now();
    const content = args.content ?? "";

    await ctx.db.insert("projectFiles", {
      projectId: args.projectId,
      path: normalizedPath,
      kind: "text",
      mimeType: args.mimeType ?? "text/plain",
      sizeBytes: new TextEncoder().encode(content).byteLength,
      sha256: await sha256Hex(content),
      revision: 1,
      textContent: content,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(args.projectId, {
      updatedAt: now,
    });
  },
});

export const renameFile = mutation({
  args: {
    projectId: v.id("projects"),
    fromPath: v.string(),
    toPath: v.string(),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const existing = await getFileByPath(ctx, args.projectId, args.fromPath);

    if (!existing) {
      throw new Error("File not found.");
    }

    const targetPath = normalizeProjectPath(args.toPath);
    const duplicate = await getFileByPath(ctx, args.projectId, targetPath);

    if (duplicate) {
      throw new Error("A file already exists at the destination path.");
    }

    const now = Date.now();

    await ctx.db.patch(existing._id, {
      path: targetPath,
      updatedAt: now,
      revision: existing.revision + 1,
    });

    await ctx.db.patch(args.projectId, {
      updatedAt: now,
    });
  },
});

export const deleteFile = mutation({
  args: {
    projectId: v.id("projects"),
    path: v.string(),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const existing = await getFileByPath(ctx, args.projectId, args.path);

    if (!existing) {
      throw new Error("File not found.");
    }

    if (existing.storageId) {
      await ctx.storage.delete(existing.storageId);
    }

    await ctx.db.delete(existing._id);
    await ctx.db.patch(args.projectId, {
      updatedAt: Date.now(),
    });
  },
});

export const registerUploadedAsset = mutation({
  args: {
    projectId: v.id("projects"),
    path: v.string(),
    storageId: v.id("_storage"),
    mimeType: v.optional(v.string()),
    sizeBytes: v.number(),
    sha256: v.string(),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const normalizedPath = normalizeProjectPath(args.path);
    const existing = await getFileByPath(ctx, args.projectId, normalizedPath);
    const now = Date.now();
    const revision = (existing?.revision ?? 0) + 1;

    if (existing?.storageId) {
      await ctx.storage.delete(existing.storageId);
    }

    const patch = {
      path: normalizedPath,
      kind: "asset" as const,
      mimeType: args.mimeType ?? "application/octet-stream",
      sizeBytes: args.sizeBytes,
      sha256: args.sha256,
      revision,
      textContent: undefined,
      storageId: args.storageId,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("projectFiles", {
        projectId: args.projectId,
        createdAt: now,
        ...patch,
      });
    }

    await ctx.db.patch(args.projectId, {
      updatedAt: now,
    });

    return {
      path: normalizedPath,
      revision,
    };
  },
});
