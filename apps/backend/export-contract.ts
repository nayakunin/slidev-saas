export const exportFormats = ["pdf", "pptx"] as const;
export type ExportFormat = (typeof exportFormats)[number];

export const exportJobStatuses = [
  "queued",
  "dispatching",
  "rendering",
  "succeeded",
  "failed",
] as const;
export type ExportJobStatus = (typeof exportJobStatuses)[number];

export const EXPORT_PIPELINE_VERSION = "v1";

export interface ExportSnapshotFile {
  path: string;
  kind: "text" | "asset";
  mimeType: string | null;
  textContent: string | null;
  downloadUrl: string | null;
  sha256: string;
}

export interface ExportJobSubmission {
  jobId: string;
  projectId: string;
  projectTitle: string;
  entryFilePath: string;
  format: ExportFormat;
  fingerprint: string;
  pipelineVersion: string;
  callbackUrl: string;
  files: ExportSnapshotFile[];
}

export type ExportJobCallbackPayload =
  | {
      jobId: string;
      status: "rendering";
    }
  | {
      jobId: string;
      status: "failed";
      errorMessage: string;
    }
  | {
      jobId: string;
      status: "succeeded";
      fingerprint: string;
      bucketKey: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      etag?: string | null;
    };

function slugifyExportTitle(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "presentation";
}

export function getExportExtension(format: ExportFormat): string {
  return format === "pdf" ? "pdf" : "pptx";
}

export function getExportMimeType(format: ExportFormat): string {
  return format === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
}

export function getExportFileName({
  title,
  format,
}: {
  title: string;
  format: ExportFormat;
}): string {
  return `${slugifyExportTitle(title)}.${getExportExtension(format)}`;
}

export function getExportObjectKey({
  projectId,
  format,
  fingerprint,
  pipelineVersion = EXPORT_PIPELINE_VERSION,
}: {
  projectId: string;
  format: ExportFormat;
  fingerprint: string;
  pipelineVersion?: string;
}): string {
  return `exports/${projectId}/${format}/${fingerprint}/${pipelineVersion}.${getExportExtension(format)}`;
}
