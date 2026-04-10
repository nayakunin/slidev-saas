import { defineSchema, defineTable } from "convex/server";
import type { Infer } from "convex/values";
import { v } from "convex/values";

import type { ExportFormat, ExportJobStatus } from "../export-contract";
import type { ProjectFileKind } from "./editor";

export const projectFileKindValidator = v.union(
  v.literal("text"),
  v.literal("asset"),
);
export const exportFormatValidator = v.union(v.literal("pdf"), v.literal("pptx"));
export const exportJobStatusValidator = v.union(
  v.literal("queued"),
  v.literal("dispatching"),
  v.literal("rendering"),
  v.literal("succeeded"),
  v.literal("failed"),
);

const projects = defineTable({
  title: v.string(),
  slug: v.string(),
  ownerTokenIdentifier: v.optional(v.string()),
  templateVersion: v.string(),
  entryFilePath: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  lastOpenedAt: v.number(),
})
  .index("by_slug", ["slug"])
  .index("by_ownerTokenIdentifier", ["ownerTokenIdentifier"])
  .index("by_ownerTokenIdentifier_and_updatedAt", ["ownerTokenIdentifier", "updatedAt"])
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
  ownerTokenIdentifier: v.string(),
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
  .index("by_ownerTokenIdentifier_and_format", ["ownerTokenIdentifier", "format"]);

const exportJobs = defineTable({
  projectId: v.id("projects"),
  ownerTokenIdentifier: v.string(),
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
  .index("by_ownerTokenIdentifier_and_createdAt", ["ownerTokenIdentifier", "createdAt"]);

const schema = defineSchema({
  exportCaches,
  exportJobs,
  projects,
  projectFiles,
});

export default schema;

export type ProjectRecord = Infer<typeof schema.tables.projects.validator>;
export type ProjectFileRecord = Infer<typeof schema.tables.projectFiles.validator>;
export type ProjectFileKindRecord = ProjectFileKind;
export type ExportFormatRecord = ExportFormat;
export type ExportJobStatusRecord = ExportJobStatus;
