import { defineSchema, defineTable } from "convex/server";
import type { Infer } from "convex/values";
import { v } from "convex/values";

import type { ExportFormat, ExportJobStatus } from "../export-contract";
import type { ProjectFileKind } from "./editor";

export const projectFileKindValidator = v.union(v.literal("text"), v.literal("asset"));
export const exportFormatValidator = v.union(v.literal("pdf"), v.literal("pptx"));
export const exportJobStatusValidator = v.union(
  v.literal("queued"),
  v.literal("dispatching"),
  v.literal("rendering"),
  v.literal("succeeded"),
  v.literal("failed"),
);
export const workspaceKindValidator = v.union(v.literal("personal"), v.literal("organization"));

const users = defineTable({
  workosUserId: v.string(),
  tokenIdentifier: v.string(),
  email: v.optional(v.string()),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  profilePictureUrl: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  lastSeenAt: v.number(),
})
  .index("by_workosUserId", ["workosUserId"])
  .index("by_tokenIdentifier", ["tokenIdentifier"])
  .index("by_email", ["email"]);

const workspaces = defineTable({
  kind: workspaceKindValidator,
  name: v.string(),
  slug: v.string(),
  ownerUserId: v.optional(v.id("users")),
  workosOrganizationId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_slug", ["slug"])
  .index("by_ownerUserId", ["ownerUserId"])
  .index("by_workosOrganizationId", ["workosOrganizationId"]);

const projects = defineTable({
  title: v.string(),
  slug: v.string(),
  workspaceId: v.id("workspaces"),
  createdByUserId: v.id("users"),
  templateVersion: v.string(),
  entryFilePath: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  lastOpenedAt: v.number(),
})
  .index("by_slug", ["slug"])
  .index("by_workspaceId", ["workspaceId"])
  .index("by_workspaceId_and_updatedAt", ["workspaceId", "updatedAt"])
  .index("by_updatedAt", ["updatedAt"]);

const projectFiles = defineTable({
  projectId: v.id("projects"),
  path: v.string(),
  kind: projectFileKindValidator,
  mimeType: v.optional(v.string()),
  sizeBytes: v.number(),
  sha256: v.string(),
  revision: v.number(),
  textContent: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_project", ["projectId"])
  .index("by_project_path", ["projectId", "path"]);

const exportCaches = defineTable({
  projectId: v.id("projects"),
  workspaceId: v.id("workspaces"),
  format: exportFormatValidator,
  fingerprint: v.string(),
  pipelineVersion: v.string(),
  bucketKey: v.string(),
  fileName: v.string(),
  mimeType: v.string(),
  sizeBytes: v.optional(v.number()),
  etag: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_projectId_and_format", ["projectId", "format"])
  .index("by_workspaceId_and_format", ["workspaceId", "format"]);

const exportJobs = defineTable({
  projectId: v.id("projects"),
  workspaceId: v.id("workspaces"),
  requestedByUserId: v.id("users"),
  format: exportFormatValidator,
  fingerprint: v.string(),
  pipelineVersion: v.string(),
  status: exportJobStatusValidator,
  errorMessage: v.optional(v.string()),
  cacheId: v.optional(v.id("exportCaches")),
  workId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  completedAt: v.optional(v.number()),
})
  .index("by_projectId_and_format_and_fingerprint", ["projectId", "format", "fingerprint"])
  .index("by_workspaceId_and_createdAt", ["workspaceId", "createdAt"]);

const schema = defineSchema({
  users,
  workspaces,
  exportCaches,
  exportJobs,
  projects,
  projectFiles,
});

export default schema;

export type UserRecord = Infer<typeof schema.tables.users.validator>;
export type WorkspaceRecord = Infer<typeof schema.tables.workspaces.validator>;
export type ProjectRecord = Infer<typeof schema.tables.projects.validator>;
export type ProjectFileRecord = Infer<typeof schema.tables.projectFiles.validator>;
export type ProjectFileKindRecord = ProjectFileKind;
export type ExportFormatRecord = ExportFormat;
export type ExportJobStatusRecord = ExportJobStatus;
