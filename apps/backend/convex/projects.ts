import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import {
  ensureCurrentPersonalContext,
  getCurrentPersonalContextOrNull,
  requireProjectAccess,
} from "./auth";
import {
  buildTextFileRecord,
  ENTRY_FILE_PATH,
  slugify,
  TEMPLATE_VERSION,
  templateFiles,
} from "./lib";

export const listProjects = query({
  args: {},
  handler: async (ctx) => {
    const context = await getCurrentPersonalContextOrNull(ctx);

    if (!context) {
      return [];
    }

    return await ctx.db
      .query("projects")
      .withIndex("by_workspaceId_and_updatedAt", (query) =>
        query.eq("workspaceId", context.workspace._id),
      )
      .order("desc")
      .take(100);
  },
});

export const getProject = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const { project } = await requireProjectAccess(ctx, args.projectId);
    return project;
  },
});

export const createProjectFromTemplate = mutation({
  args: {
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, workspace } = await ensureCurrentPersonalContext(ctx);
    const now = Date.now();
    const baseSlug = slugify(args.title);
    let slug = baseSlug;
    let suffix = 1;

    while (
      await ctx.db
        .query("projects")
        .withIndex("by_slug", (query) => query.eq("slug", slug))
        .unique()
    ) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    const projectId = await ctx.db.insert("projects", {
      title: args.title.trim() || "Untitled deck",
      slug,
      workspaceId: workspace._id,
      createdByUserId: user._id,
      templateVersion: TEMPLATE_VERSION,
      entryFilePath: ENTRY_FILE_PATH,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    });

    for (const file of templateFiles) {
      await ctx.db.insert(
        "projectFiles",
        await buildTextFileRecord({
          projectId,
          path: file.path,
          content: file.content,
          mimeType: file.mimeType,
          now,
        }),
      );
    }

    return projectId;
  },
});

export const markOpened = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);

    const now = Date.now();

    await ctx.db.patch(args.projectId, {
      lastOpenedAt: now,
      updatedAt: now,
    });
  },
});
