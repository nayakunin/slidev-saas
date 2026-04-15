import type { UserIdentity } from "convex/server";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";

type AuthCtx = Pick<ActionCtx | MutationCtx | QueryCtx, "auth">;
type ReadCtx = Pick<QueryCtx | MutationCtx, "auth" | "db">;

function logIdentityState(event: string, identity: UserIdentity | null) {
  console.info("[auth-debug]", event, {
    email: identity?.email ?? null,
    issuer: identity?.issuer ?? null,
    subject: identity?.subject ?? null,
    tokenIdentifier: identity?.tokenIdentifier ?? null,
  });
}

export async function requireIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  logIdentityState("requireIdentity", identity);

  if (!identity) {
    throw new Error("Authentication required.");
  }

  return identity;
}

function getCachedUserFields(identity: UserIdentity) {
  return {
    email: identity.email,
    firstName: identity.givenName,
    lastName: identity.familyName,
    profilePictureUrl: identity.pictureUrl,
  };
}

function getPreferredUserLabel(user: Pick<Doc<"users">, "firstName" | "lastName" | "email">) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

  if (fullName.length > 0) {
    return fullName;
  }

  if (user.email) {
    return user.email.split("@")[0] || user.email;
  }

  return "Personal";
}

async function getUserByWorkosUserId(ctx: ReadCtx, workosUserId: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_workosUserId", (query) => query.eq("workosUserId", workosUserId))
    .unique();
}

async function getUserByTokenIdentifier(ctx: ReadCtx, tokenIdentifier: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (query) => query.eq("tokenIdentifier", tokenIdentifier))
    .unique();
}

async function getCurrentUser(ctx: ReadCtx, identity: UserIdentity) {
  const userByWorkosUserId = await getUserByWorkosUserId(ctx, identity.subject);
  const userByTokenIdentifier = await getUserByTokenIdentifier(ctx, identity.tokenIdentifier);

  if (
    userByWorkosUserId &&
    userByTokenIdentifier &&
    userByWorkosUserId._id !== userByTokenIdentifier._id
  ) {
    throw new Error("Current identity is linked to conflicting local users.");
  }

  return userByWorkosUserId ?? userByTokenIdentifier;
}

export async function getOrCreateCurrentUser(ctx: MutationCtx, identity: UserIdentity) {
  const existing = await getCurrentUser(ctx, identity);
  const now = Date.now();
  const cachedFields = getCachedUserFields(identity);

  if (existing) {
    await ctx.db.patch(existing._id, {
      workosUserId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      ...cachedFields,
      updatedAt: now,
      lastSeenAt: now,
    });

    return {
      ...existing,
      workosUserId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      ...cachedFields,
      updatedAt: now,
      lastSeenAt: now,
    };
  }

  const userId = await ctx.db.insert("users", {
    workosUserId: identity.subject,
    tokenIdentifier: identity.tokenIdentifier,
    ...cachedFields,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  });

  const user = await ctx.db.get(userId);

  if (!user) {
    throw new Error("Failed to create current user.");
  }

  return user;
}

async function getPersonalWorkspaceByOwnerUserId(ctx: ReadCtx, ownerUserId: Id<"users">) {
  return await ctx.db
    .query("workspaces")
    .withIndex("by_ownerUserId", (query) => query.eq("ownerUserId", ownerUserId))
    .unique();
}

export async function getOrCreatePersonalWorkspace(ctx: MutationCtx, user: Doc<"users">) {
  const existing = await getPersonalWorkspaceByOwnerUserId(ctx, user._id);

  if (existing) {
    if (
      existing.kind !== "personal" ||
      existing.ownerUserId !== user._id ||
      existing.workosOrganizationId
    ) {
      throw new Error("Existing owner workspace is not a valid personal workspace.");
    }

    return existing;
  }

  const now = Date.now();
  const workspaceId = await ctx.db.insert("workspaces", {
    kind: "personal",
    name: `${getPreferredUserLabel(user)}'s Workspace`,
    slug: `personal-${user._id}`,
    ownerUserId: user._id,
    createdAt: now,
    updatedAt: now,
  });

  const workspace = await ctx.db.get(workspaceId);

  if (!workspace) {
    throw new Error("Failed to create personal workspace.");
  }

  return workspace;
}

export async function requireCurrentPersonalContext(ctx: ReadCtx) {
  const context = await getCurrentPersonalContextOrNull(ctx);

  if (!context) {
    throw new Error("Personal workspace has not been initialized.");
  }

  return context;
}

export async function getCurrentPersonalContextOrNull(ctx: ReadCtx) {
  const identity = await requireIdentity(ctx);
  const user = await getCurrentUser(ctx, identity);

  if (!user) {
    console.info("[auth-debug] No local user found for authenticated identity.", {
      issuer: identity.issuer,
      subject: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
    });
    return null;
  }

  const workspace = await getPersonalWorkspaceByOwnerUserId(ctx, user._id);

  if (
    !workspace ||
    workspace.kind !== "personal" ||
    workspace.ownerUserId !== user._id ||
    workspace.workosOrganizationId
  ) {
    console.info("[auth-debug] Personal workspace lookup failed for authenticated user.", {
      tokenIdentifier: identity.tokenIdentifier,
      userId: user._id,
      workspaceId: workspace?._id ?? null,
      workspaceKind: workspace?.kind ?? null,
      workspaceOwnerUserId: workspace?.ownerUserId ?? null,
      workspaceWorkosOrganizationId: workspace?.workosOrganizationId ?? null,
    });
    return null;
  }

  return { identity, user, workspace };
}

export async function ensureCurrentPersonalContext(ctx: MutationCtx) {
  const identity = await requireIdentity(ctx);
  const user = await getOrCreateCurrentUser(ctx, identity);
  const workspace = await getOrCreatePersonalWorkspace(ctx, user);

  return { identity, user, workspace };
}

export async function requireWorkspaceAccess(ctx: ReadCtx, workspaceId: Id<"workspaces">) {
  const context = await requireCurrentPersonalContext(ctx);

  if (context.workspace._id !== workspaceId) {
    throw new Error("Workspace not found.");
  }

  return context;
}

export async function requireProjectAccess(ctx: ReadCtx, projectId: Id<"projects">) {
  const project = await ctx.db.get(projectId);

  if (!project) {
    throw new Error("Project not found.");
  }

  const context = await requireWorkspaceAccess(ctx, project.workspaceId);

  return {
    ...context,
    project,
  };
}

export const ensureCurrentUserWorkspace = mutation({
  args: {},
  handler: async (ctx) => {
    const { user, workspace } = await ensureCurrentPersonalContext(ctx);

    return {
      userId: user._id,
      workspaceId: workspace._id,
    };
  },
});
