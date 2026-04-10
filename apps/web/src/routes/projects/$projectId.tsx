import {
  api,
  exportFormats,
  type ExportFormat,
  type Id,
  type ProjectTreeNode,
} from "@app/backend";
import { Marp } from "@marp-team/marp-core";
import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";

import { AppShell } from "@/components/app-shell";
import { ProjectTree } from "@/components/editor/project-tree";
import { Button } from "@/components/ui/button";
import {
  findFirstFilePath,
  guessTextMimeType,
  normalizeProjectPath,
  sha256ForArrayBuffer,
} from "@/lib/editor";

const marp = new Marp();
const exportFormatLabels: Record<ExportFormat, string> = {
  pdf: "PDF",
  pptx: "PPTX",
};

export const Route = createFileRoute("/projects/$projectId")({
  component: EditorPage,
});

function hasFilePath(nodes: ProjectTreeNode[], targetPath: string): boolean {
  for (const node of nodes) {
    if (node.type === "file" && node.path === targetPath) {
      return true;
    }

    if (node.children && hasFilePath(node.children, targetPath)) {
      return true;
    }
  }

  return false;
}

function buildPreviewDocument({ css, html }: { css: string; html: string }) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>${css}</style>
    <style>
      html, body {
        margin: 0;
        background: #0b1020;
      }
    </style>
  </head>
  <body>${html}</body>
</html>`;
}

function EditorPage() {
  const { projectId } = Route.useParams();
  return <Editor projectId={projectId as Id<"projects">} />;
}

function Editor({ projectId }: { projectId: Id<"projects"> }) {
  const [activeExportJobs, setActiveExportJobs] = useState<
    Partial<Record<ExportFormat, Id<"exportJobs">>>
  >({});
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<{
    isSaving: boolean;
    message: string | null;
  }>({
    isSaving: false,
    message: null,
  });

  const project = useQuery(api.projects.getProject, { projectId }) ?? null;
  const tree = useQuery(api.projectFiles.getProjectTree, { projectId }) ?? [];
  const activeFile =
    useQuery(api.projectFiles.getFile, selectedPath ? { projectId, path: selectedPath } : "skip") ??
    null;

  const createFile = useMutation(api.projectFiles.createFile);
  const deleteFile = useMutation(api.projectFiles.deleteFile);
  const generateUploadUrl = useMutation(api.projectFiles.generateUploadUrl);
  const getExportDownloadUrl = useAction(api.exportsActions.getExportDownloadUrl);
  const markProjectOpened = useMutation(api.projects.markOpened);
  const registerUploadedAsset = useMutation(api.projectFiles.registerUploadedAsset);
  const renameFile = useMutation(api.projectFiles.renameFile);
  const requestExport = useAction(api.exportsActions.requestExport);
  const saveTextFile = useMutation(api.projectFiles.saveTextFile);

  const projectTree = tree as ProjectTreeNode[];
  const fileKey = `${projectId}:${selectedPath ?? ""}`;
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

  const previewTargetPath = useMemo(() => {
    const entryFilePath = project?.entryFilePath ?? null;

    if (entryFilePath && hasFilePath(projectTree, entryFilePath)) {
      return entryFilePath;
    }

    if (selectedPath && activeFile?.kind === "text") {
      return selectedPath;
    }

    return findFirstFilePath(projectTree);
  }, [activeFile?.kind, project?.entryFilePath, projectTree, selectedPath]);

  const previewFile =
    useQuery(
      api.projectFiles.getFile,
      previewTargetPath ? { projectId, path: previewTargetPath } : "skip",
    ) ?? null;

  const previewMarkdown = useDeferredValue(
    previewTargetPath && selectedPath === previewTargetPath && activeFile?.kind === "text"
      ? editorValue
      : previewFile?.kind === "text"
        ? (previewFile.textContent ?? "")
        : "",
  );

  useEffect(() => {
    void markProjectOpened({ projectId });
  }, [markProjectOpened, projectId]);

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
        setExportError(
          error instanceof Error ? error.message : "Failed to download the export.",
        );
      } finally {
        setActiveExportJobs((current) => ({
          ...current,
          [succeededFormat]: undefined,
        }));
        setExportingFormat((current) =>
          current === succeededFormat ? null : current,
        );
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

  useEffect(() => {
    if (!project) return;

    const firstFilePath = findFirstFilePath(projectTree);
    const desiredPath =
      selectedPath && selectedPath.length > 0
        ? selectedPath
        : project.entryFilePath || firstFilePath;

    if (desiredPath && desiredPath !== selectedPath) {
      setSelectedPath(desiredPath);
    }
  }, [project, projectTree, selectedPath]);

  useEffect(() => {
    if (activeFile?.kind !== "text") return;
    setEditorValue(activeFile.textContent ?? "");
  }, [activeFile?._id, activeFile?.kind, activeFile?.revision, activeFile?.textContent, fileKey]);

  useEffect(() => {
    if (!previewTargetPath) {
      startTransition(() => {
        setPreviewDoc(null);
        setPreviewError("Create or select a markdown file to start the preview.");
      });
      return;
    }

    if (!previewMarkdown.trim()) {
      startTransition(() => {
        setPreviewDoc(null);
        setPreviewError(`Add slide content to ${previewTargetPath} to render the preview.`);
      });
      return;
    }

    const handle = window.setTimeout(() => {
      try {
        const { css, html } = marp.render(previewMarkdown);

        startTransition(() => {
          setPreviewDoc(buildPreviewDocument({ css, html }));
          setPreviewError(null);
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to render the presentation preview.";

        startTransition(() => {
          setPreviewDoc(null);
          setPreviewError(message);
        });
      }
    }, 150);

    return () => {
      window.clearTimeout(handle);
    };
  }, [previewMarkdown, previewTargetPath]);

  useEffect(() => {
    if (!selectedPath || activeFile?.kind !== "text") return;

    const remoteValue = activeFile.textContent ?? "";
    if (editorValue === remoteValue) return;

    const handle = window.setTimeout(() => {
      void (async () => {
        setSaveState({ isSaving: true, message: null });

        try {
          await saveTextFile({
            projectId,
            path: selectedPath,
            content: editorValue,
            mimeType: guessTextMimeType(selectedPath),
          });
          setSaveState({ isSaving: false, message: null });
        } catch (error) {
          setSaveState({
            isSaving: false,
            message: error instanceof Error ? error.message : "Failed to save the file.",
          });
        }
      })();
    }, 650);

    return () => {
      window.clearTimeout(handle);
    };
  }, [
    activeFile?.kind,
    activeFile?.textContent,
    editorValue,
    projectId,
    saveTextFile,
    selectedPath,
  ]);

  const assetPreview = useMemo(() => {
    if (
      activeFile?.kind === "asset" &&
      activeFile.mimeType?.startsWith("image/") &&
      activeFile.downloadUrl
    ) {
      return (
        <img
          alt={activeFile.path}
          className="max-h-80 w-full border border-border object-contain"
          src={activeFile.downloadUrl}
        />
      );
    }

    return null;
  }, [activeFile]);

  async function handleCreateFile() {
    const path = window.prompt("New file path", "notes.md");
    if (!path) return;

    const normalizedPath = normalizeProjectPath(path);
    await createFile({ projectId, path: normalizedPath, content: "" });
    setSelectedPath(normalizedPath);
  }

  async function handleRenameFile() {
    if (!selectedPath) return;

    const nextPath = window.prompt("Rename file", selectedPath);
    if (!nextPath || nextPath === selectedPath) return;

    const normalizedPath = normalizeProjectPath(nextPath);
    await renameFile({ projectId, fromPath: selectedPath, toPath: normalizedPath });
    setSelectedPath(normalizedPath);
  }

  async function handleDeleteFile() {
    if (!selectedPath) return;

    const confirmed = window.confirm(`Delete ${selectedPath}?`);
    if (!confirmed) return;

    await deleteFile({ projectId, path: selectedPath });
    setSelectedPath(null);
  }

  async function handleUploadAsset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const path = window.prompt("Asset path", `public/${file.name}`);
    if (!path) {
      event.target.value = "";
      return;
    }

    const uploadUrl = await generateUploadUrl({});
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file,
    });
    const { storageId } = (await uploadResponse.json()) as { storageId: string };
    const buffer = await file.arrayBuffer();
    const normalizedPath = normalizeProjectPath(path);

    await registerUploadedAsset({
      projectId,
      path: normalizedPath,
      storageId: storageId as Id<"_storage">,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      sha256: await sha256ForArrayBuffer(buffer),
    });
    setSelectedPath(normalizedPath);
    event.target.value = "";
  }

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

  const exportStatusByFormat: Partial<Record<ExportFormat, string>> = {
    pdf: pdfExportStatus?.status,
    pptx: pptxExportStatus?.status,
  };

  return (
    <AppShell breadcrumb={project?.title ?? "Editor"}>
      <div className="grid h-[calc(100vh-4rem)] grid-cols-[280px_minmax(0,1fr)_minmax(320px,40%)]">
        <section className="flex flex-col overflow-y-auto border-r">
          <div className="flex flex-wrap gap-2 border-b p-3">
            <Button
              onClick={() => void handleCreateFile()}
              size="sm"
              type="button"
              variant="outline"
            >
              New File
            </Button>
            <Button
              disabled={!selectedPath}
              onClick={() => void handleRenameFile()}
              size="sm"
              type="button"
              variant="outline"
            >
              Rename
            </Button>
            <Button
              disabled={!selectedPath}
              onClick={() => void handleDeleteFile()}
              size="sm"
              type="button"
              variant="outline"
            >
              Delete
            </Button>
          </div>

          <label className="mx-3 mt-3 block cursor-pointer border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition hover:border-foreground/30 hover:text-foreground">
            Upload Asset
            <input
              className="hidden"
              onChange={(event) => void handleUploadAsset(event)}
              type="file"
            />
          </label>

          <div className="flex-1 p-3">
            <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              Files
            </div>
            <ProjectTree
              nodes={projectTree}
              onSelect={setSelectedPath}
              selectedPath={selectedPath}
            />
          </div>
        </section>

        <section className="flex flex-col overflow-hidden bg-[#0d1117] text-[#f4f7fb]">
          <div className="shrink-0 border-b border-white/10 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm text-white/55">
                {selectedPath ?? "Select a file to start editing"}
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex flex-wrap justify-end gap-2">
                  {exportFormats.map((format) => {
                    const status = exportStatusByFormat[format];
                    const isRunning =
                      exportingFormat === format &&
                      (status === undefined ||
                        status === "queued" ||
                        status === "dispatching" ||
                        status === "rendering");

                    return (
                      <Button
                        key={format}
                        disabled={isRunning}
                        onClick={() => void handleExport(format)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {isRunning ? "Exporting…" : `Export ${exportFormatLabels[format]}`}
                      </Button>
                    );
                  })}
                </div>
                <div className="text-right text-xs text-white/55">
                  {saveState.isSaving ? "Saving…" : "Autosave enabled"}
                  {saveState.message ? (
                    <div className="mt-1 text-amber-300">{saveState.message}</div>
                  ) : null}
                  {exportError ? <div className="mt-1 text-amber-300">{exportError}</div> : null}
                </div>
              </div>
            </div>
          </div>

          {activeFile?.kind === "text" ? (
            <textarea
              className="flex-1 w-full resize-none border-0 bg-transparent p-4 font-mono text-sm leading-7 text-inherit outline-none"
              onChange={(event) => setEditorValue(event.target.value)}
              spellCheck={false}
              value={editorValue}
            />
          ) : activeFile?.kind === "asset" ? (
            <div className="space-y-4 p-4">
              <div className="text-sm text-white/70">
                Binary asset stored in Convex File Storage.
              </div>
              {assetPreview}
              <div className="border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                <div>Path: {activeFile.path}</div>
                <div>MIME: {activeFile.mimeType ?? "unknown"}</div>
                <div>Revision: {activeFile.revision}</div>
                {activeFile.downloadUrl ? <div>URL: {activeFile.downloadUrl}</div> : null}
              </div>
            </div>
          ) : (
            <div className="p-4 text-sm text-white/55">Pick a file to begin.</div>
          )}
        </section>

        <section className="flex flex-col overflow-hidden border-l">
          <div className="shrink-0 border-b px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">Local Marp preview</div>
              <div className="text-right text-xs text-muted-foreground">
                {previewTargetPath ? `Rendering ${previewTargetPath}` : "No preview file"}
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
            {previewError ? (
              <div className="border border-amber-300/50 bg-amber-300/10 px-3 py-2 text-sm text-amber-900">
                {previewError}
              </div>
            ) : null}
            <div className="flex-1 overflow-hidden border border-border bg-white">
              {previewDoc ? (
                <iframe
                  className="h-full min-h-[500px] w-full"
                  sandbox="allow-same-origin"
                  srcDoc={previewDoc}
                  title="Slide preview"
                />
              ) : (
                <div className="flex h-full min-h-[500px] items-center justify-center bg-[#f8fafc] p-6 text-center text-sm text-slate-600">
                  <div className="max-w-sm space-y-2">
                    <div className="font-medium text-slate-900">Preview unavailable</div>
                    <div>
                      {previewError ??
                        "The selected project does not have a renderable markdown file yet."}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
