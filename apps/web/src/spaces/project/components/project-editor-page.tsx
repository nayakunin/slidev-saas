import { exportFormats, type ExportFormat, type Id } from "@app/backend";

import { Button } from "@/components/ui/button";
import { useProjectEditorState } from "@/spaces/project/hooks/use-project-editor-state";
import { useProjectExportState } from "@/spaces/project/hooks/use-project-export-state";

import { ProjectTree } from "./project-tree";

const exportFormatLabels: Record<ExportFormat, string> = {
  pdf: "PDF",
  pptx: "PPTX",
};

export function ProjectEditorScreen({ projectId }: { projectId: Id<"projects"> }) {
  const {
    activeFile,
    editorValue,
    handleCreateFile,
    handleDeleteFile,
    handleRenameFile,
    handleUploadAsset,
    previewDoc,
    previewError,
    previewTargetPath,
    projectTree,
    saveState,
    selectedPath,
    setEditorValue,
    setSelectedPath,
  } = useProjectEditorState(projectId);
  const { exportError, exportingFormat, exportStatusByFormat, handleExport } =
    useProjectExportState(projectId);

  return (
    <div className="grid h-[calc(100vh-4rem)] grid-cols-[280px_minmax(0,1fr)_minmax(320px,40%)]">
      <section className="flex flex-col overflow-y-auto border-r">
        <div className="flex flex-wrap gap-2 border-b p-3">
          <Button onClick={() => void handleCreateFile()} size="sm" type="button" variant="outline">
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
          <ProjectTree nodes={projectTree} onSelect={setSelectedPath} selectedPath={selectedPath} />
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
            <div className="text-sm text-white/70">Binary asset stored in Convex File Storage.</div>
            {activeFile.mimeType?.startsWith("image/") && activeFile.downloadUrl ? (
              <img
                alt={activeFile.path}
                className="max-h-80 w-full border border-border object-contain"
                src={activeFile.downloadUrl}
              />
            ) : null}
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
  );
}
