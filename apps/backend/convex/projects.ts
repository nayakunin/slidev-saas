import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { ensureProjectOwner, requireIdentity, requireProjectAccess } from "./auth";
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
    const identity = await requireIdentity(ctx);

    return await ctx.db
      .query("projects")
      .withIndex("by_ownerTokenIdentifier_and_updatedAt", (query) =>
        query.eq("ownerTokenIdentifier", identity.tokenIdentifier),
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
    const identity = await requireIdentity(ctx);
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
      ownerTokenIdentifier: identity.tokenIdentifier,
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
    const { identity, project } = await requireProjectAccess(ctx, args.projectId);
    await ensureProjectOwner(ctx, project, identity.tokenIdentifier);

    const now = Date.now();

    await ctx.db.patch(args.projectId, {
      lastOpenedAt: now,
      updatedAt: now,
    });
  },
});
