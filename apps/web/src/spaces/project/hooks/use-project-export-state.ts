import { api, exportFormats, type ExportFormat, type Id } from "@app/backend";
import { useAction, useQuery } from "convex/react";
import { useEffect, useState } from "react";

export function useProjectExportState(projectId: Id<"projects">) {
  const [activeExportJobs, setActiveExportJobs] = useState<
    Partial<Record<ExportFormat, Id<"exportJobs">>>
  >({});
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);

  const getExportDownloadUrl = useAction(api.exportsActions.getExportDownloadUrl);
  const requestExport = useAction(api.exportsActions.requestExport);

  const pdfExportStatus =
    useQuery(
      api.exports.getExportStatus,
      activeExportJobs.pdf ? { jobId: activeExportJobs.pdf } : "skip",
    ) ?? null;
  const pptxExportStatus =
    useQuery(
      api.exports.getExportStatus,
      activeExportJobs.pptx ? { jobId: activeExportJobs.pptx } : "skip",
    ) ?? null;

  useEffect(() => {
    const succeededFormat = exportFormats.find((format) => {
      const status = format === "pdf" ? pdfExportStatus : pptxExportStatus;
      return status?.status === "succeeded";
    });

    if (!succeededFormat) {
      return;
    }

    void (async () => {
      try {
        const downloadUrl = await getExportDownloadUrl({
          projectId,
          format: succeededFormat,
        });
        window.open(downloadUrl, "_blank", "noopener,noreferrer");
        setExportError(null);
      } catch (error) {
        setExportError(error instanceof Error ? error.message : "Failed to download the export.");
      } finally {
        setActiveExportJobs((current) => ({
          ...current,
          [succeededFormat]: undefined,
        }));
        setExportingFormat((current) => (current === succeededFormat ? null : current));
      }
    })();
  }, [getExportDownloadUrl, pdfExportStatus, pptxExportStatus, projectId]);

  useEffect(() => {
    const failedFormat = exportFormats.find((format) => {
      const status = format === "pdf" ? pdfExportStatus : pptxExportStatus;
      return status?.status === "failed";
    });

    if (!failedFormat) {
      return;
    }

    const status = failedFormat === "pdf" ? pdfExportStatus : pptxExportStatus;
    setExportError(status?.errorMessage ?? "Export failed.");
    setActiveExportJobs((current) => ({
      ...current,
      [failedFormat]: undefined,
    }));
    setExportingFormat((current) => (current === failedFormat ? null : current));
  }, [pdfExportStatus, pptxExportStatus]);

  async function handleExport(format: ExportFormat) {
    setExportError(null);
    setExportingFormat(format);

    try {
      const result = await requestExport({ projectId, format });

      if (result.kind === "ready") {
        window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
        setExportingFormat(null);
        return;
      }

      setActiveExportJobs((current) => ({
        ...current,
        [format]: result.jobId,
      }));
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Failed to start export.");
      setActiveExportJobs((current) => ({
        ...current,
        [format]: undefined,
      }));
      setExportingFormat(null);
    }
  }

  return {
    exportError,
    exportingFormat,
    exportStatusByFormat: {
      pdf: pdfExportStatus?.status,
      pptx: pptxExportStatus?.status,
    } satisfies Partial<Record<ExportFormat, string | undefined>>,
    handleExport,
  };
}
