# WorkOS Identity And Ownership Model

## Summary

This application should use WorkOS as the source of truth for authentication, WorkOS user identity, organizations, and organization memberships. Convex should store only the minimum application data required to model product ownership and relationships between product resources.

The product is B2C-first with B2B added later. The ownership model should therefore support both personal and organization-backed workspaces without forcing all consumer accounts into a WorkOS organization.

## Goals

- Support B2C as the primary initial product shape.
- Support B2B later without rewriting resource ownership.
- Avoid unnecessary duplication between Convex and WorkOS.
- Keep authorization logic simple and explicit.
- Stop using JWT token identifiers as the ownership model for product data.

## Non-Goals

- Implement full B2B collaboration now.
- Mirror WorkOS organization memberships into Convex.
- Add billing, permissions, or invitation flows beyond the data model decisions needed now.
- Preserve the current single-account schema.

## Current State

The current schema stores ownership directly on product records using `ownerTokenIdentifier`.

- `projects.ownerTokenIdentifier`
- `exportCaches.ownerTokenIdentifier`
- `exportJobs.ownerTokenIdentifier`

Authorization compares those fields directly with `ctx.auth.getUserIdentity().tokenIdentifier`.

This works for a single-account prototype but creates the wrong boundary for a product that will eventually support both personal and organization-owned resources.

## Decision

Adopt a local workspace model with two workspace kinds:

- `personal`
- `organization`

Personal workspaces are local Convex records owned by a local user record.
Organization workspaces are local Convex records linked to a WorkOS organization by `workosOrganizationId`.

WorkOS remains the source of truth for:

- authentication
- sessions
- WorkOS user identity
- organizations
- organization memberships
- organization-scoped roles and permissions

Convex remains the source of truth for:

- app-level users
- workspaces
- projects
- project files
- exports
- any future product data

## Why This Model

### Why not keep user-owned resources only

This is the simplest short-term model, but it bakes the wrong ownership boundary into every resource. Moving from `userId` ownership to team ownership later would require a broad rewrite across schema, indexes, queries, mutations, and authorization helpers.

### Why not create one WorkOS organization per consumer

This makes the B2C path inherit B2B complexity without meaningful product benefit.

- Every consumer account becomes an organization lifecycle problem.
- Personal ownership becomes dependent on org selection semantics.
- Tokens and active context become more complex because org selection matters even for solo use.
- The product still needs local workspace rows for app data, so this does not eliminate much local state.

This approach should only be reconsidered if the product later proves that almost every "personal" account is actually an early team workspace.

### Why local workspaces are the right abstraction

`workspace` is a product concept, not an auth provider concept.

It provides one ownership boundary for all app resources while allowing:

- one personal workspace per user now
- organization-backed workspaces later
- a stable local foreign key for all resource ownership

## Source Of Truth Rules

### WorkOS-owned data

Do not mirror these into Convex unless a later requirement justifies it.

- user authentication state
- session state
- organization records
- organization memberships
- organization roles and permissions

When the app needs fresh organization membership or org role information for B2B access control, it should rely on WorkOS token claims or WorkOS APIs rather than a duplicated membership table.

### Convex-owned data

These should exist locally because they are product records or local foreign-key anchors.

- `users`
- `workspaces`
- `projects`
- `projectFiles`
- `exportJobs`
- `exportCaches`

## Minimal Local Tables

### `users`

Purpose: local application actor record and stable foreign-key anchor.

Initial fields:

- `workosUserId: string`
- `tokenIdentifier: string`
- `email: string`
- `firstName?: string`
- `lastName?: string`
- `profilePictureUrl?: string`
- `createdAt: number`
- `updatedAt: number`
- `lastSeenAt: number`

Indexes:

- `by_workosUserId`
- `by_tokenIdentifier`
- `by_email`

Notes:

- This is intentionally minimal.
- Cached profile fields are acceptable because they are convenience fields, not the source of truth.
- If desired later, profile fields can be reduced and fetched from WorkOS more directly.

### `workspaces`

Purpose: single ownership boundary for app resources.

Initial fields:

- `kind: "personal" | "organization"`
- `name: string`
- `slug: string`
- `ownerUserId?: Id<"users">`
- `workosOrganizationId?: string`
- `createdAt: number`
- `updatedAt: number`

Indexes:

- `by_slug`
- `by_ownerUserId`
- `by_workosOrganizationId`

Constraints:

- A personal workspace must have `ownerUserId` and no `workosOrganizationId`.
- An organization workspace must have `workosOrganizationId` and no `ownerUserId`.
- Each user should have exactly one personal workspace.
- Each WorkOS organization should map to at most one local organization workspace.

## Tables Explicitly Deferred

### `workspaceMembers`

Do not create this table now.

Reason:

- WorkOS already owns organization membership.
- B2B collaboration is not the first milestone.
- A local membership mirror would duplicate provider state before there is a proven need.

Add this only if a later requirement demands it, such as:

- heavy Convex-native member queries
- app-specific membership metadata not suitable for WorkOS
- historical audit snapshots
- offline authorization from local data only

## Resource Ownership Refactor

All product resources should be scoped to `workspaceId`.

### `projects`

Replace:

- `ownerTokenIdentifier`

With:

- `workspaceId: Id<"workspaces">`
- `createdByUserId: Id<"users">`

Keep existing product fields like title, slug, template version, entry file path, and timestamps.

### `projectFiles`

Keep:

- `projectId`

No direct ownership field is needed because ownership derives from the parent project.

### `exportJobs`

Replace:

- `ownerTokenIdentifier`

With:

- `workspaceId: Id<"workspaces">`
- `requestedByUserId: Id<"users">`

### `exportCaches`

Replace:

- `ownerTokenIdentifier`

With:

- `workspaceId: Id<"workspaces">`

`projectId` remains valid, but cache scoping should not depend on raw auth identity.

## Authorization Model

### B2C now

1. User authenticates through WorkOS.
2. Backend resolves or creates a local `users` row from WorkOS identity.
3. Backend resolves or creates that user's personal workspace.
4. Product resources are queried and mutated within that personal workspace.

### B2B later

1. User authenticates through WorkOS.
2. App determines the active organization context.
3. Backend resolves the local organization workspace using `workosOrganizationId`.
4. Authorization uses WorkOS organization membership or token claims.
5. Product resources are queried and mutated within that organization workspace.

## Backend Helper Design

Replace the current auth helpers with an app-actor resolver layer.

Recommended helpers:

- `requireIdentity(ctx)`
- `getOrCreateCurrentUser(ctx, identity)`
- `getOrCreatePersonalWorkspace(ctx, userId)`
- `requireCurrentPersonalContext(ctx)`
- later: `requireOrganizationWorkspaceContext(ctx, workosOrganizationId)`
- later: `requireWorkspaceAccess(ctx, workspaceId)`

The important change is that raw JWT identity should be used only to resolve the current user and provider context, not as the long-term ownership key for app resources.

## Data Flow

### First sign-in

1. WorkOS authenticates the user.
2. Convex receives the authenticated identity.
3. Convex finds or creates a local `users` row.
4. Convex finds or creates the user's personal workspace.
5. New projects are created inside that workspace.

### Open existing project

1. Resolve current local user and active workspace.
2. Load the project by `projectId`.
3. Verify the project belongs to the active workspace.
4. Allow read or write access.

## Error Handling

- Missing auth identity: return authentication required.
- Missing local user after failed creation: return a server error.
- Missing personal workspace after failed creation: return a server error.
- Project not in active workspace: return not found to avoid leaking existence.
- Missing WorkOS org linkage for an organization workspace: return misconfiguration error.

## Testing Strategy

### Unit tests

- user resolution from WorkOS identity
- personal workspace creation idempotency
- project access checks by `workspaceId`
- export access checks by `workspaceId`

### Integration tests

- first sign-in creates local user and personal workspace
- creating a project stores `workspaceId` and `createdByUserId`
- listing projects only returns projects for the active workspace
- project file mutations reject access across workspace boundaries

### Deferred B2B tests

- organization workspace resolution from `workosOrganizationId`
- WorkOS membership-based authorization

## Migration Shape

This is a green-field project, so breaking changes are allowed.

Recommended migration shape:

1. Add `users` and `workspaces`.
2. Replace identity-owned resource fields with workspace-owned fields.
3. Replace indexes that depend on `ownerTokenIdentifier`.
4. Replace auth helpers with user and workspace resolvers.
5. Update all resource queries and mutations to scope by workspace.
6. Remove all remaining `ownerTokenIdentifier` ownership logic.

## Open Questions

These do not block the ownership decision, but they should be answered before implementation:

- Should `users.email` be required locally or should local users only anchor `workosUserId` and `tokenIdentifier`?
- Should the app support explicit workspace switching in the UI from the start, even if only a personal workspace exists initially?
- Should personal workspace slugs be user-derived or generated opaque identifiers?

## Final Recommendation

Implement a B2C-first local workspace model.

- Keep WorkOS as the source of truth for identity and org membership.
- Keep Convex as the source of truth for app ownership and product resources.
- Store minimal local `users`.
- Store local `workspaces`.
- Do not add `workspaceMembers` yet.
- Refactor all product ownership to `workspaceId`.

This provides the smallest local model that still keeps the future B2B path clean.
