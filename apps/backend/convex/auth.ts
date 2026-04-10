import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";

type AuthCtx = Pick<ActionCtx | MutationCtx | QueryCtx, "auth">;
type ReadProjectCtx = Pick<QueryCtx | MutationCtx, "auth" | "db">;

export async function requireIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Authentication required.");
  }

  return identity;
}

export function canAccessProject(
  project: Pick<Doc<"projects">, "ownerTokenIdentifier">,
  tokenIdentifier: string,
) {
  return !project.ownerTokenIdentifier || project.ownerTokenIdentifier === tokenIdentifier;
}

export async function requireProjectAccess(
  ctx: ReadProjectCtx,
  projectId: Id<"projects">,
) {
  const identity = await requireIdentity(ctx);
  const project = await ctx.db.get(projectId);

  if (!project || !canAccessProject(project, identity.tokenIdentifier)) {
    throw new Error("Project not found.");
  }

  return { identity, project };
}

export async function ensureProjectOwner(
  ctx: MutationCtx,
  project: Doc<"projects">,
  tokenIdentifier: string,
) {
  if (project.ownerTokenIdentifier) {
    return project;
  }

  await ctx.db.patch(project._id, { ownerTokenIdentifier: tokenIdentifier });

  return {
    ...project,
    ownerTokenIdentifier: tokenIdentifier,
  };
}
