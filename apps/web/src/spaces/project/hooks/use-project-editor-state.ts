import { api, type Id, type ProjectTreeNode } from "@app/backend";
import { Marp } from "@marp-team/marp-core";
import { useMutation, useQuery } from "convex/react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";

import {
  buildPreviewDocument,
  findFirstFilePath,
  guessTextMimeType,
  normalizeProjectPath,
  selectPreviewTargetPath,
  sha256ForArrayBuffer,
} from "@/spaces/project/lib/editor";

const marp = new Marp();

export function useProjectEditorState(projectId: Id<"projects">) {
  const [editorValue, setEditorValue] = useState("");
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<{
    isSaving: boolean;
    message: string | null;
  }>({
    isSaving: false,
    message: null,
  });
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const project = useQuery(api.projects.getProject, { projectId }) ?? null;
  const tree = useQuery(api.projectFiles.getProjectTree, { projectId }) ?? [];
  const activeFile =
    useQuery(api.projectFiles.getFile, selectedPath ? { projectId, path: selectedPath } : "skip") ??
    null;

  const createFile = useMutation(api.projectFiles.createFile);
  const deleteFile = useMutation(api.projectFiles.deleteFile);
  const generateUploadUrl = useMutation(api.projectFiles.generateUploadUrl);
  const markProjectOpened = useMutation(api.projects.markOpened);
  const registerUploadedAsset = useMutation(api.projectFiles.registerUploadedAsset);
  const renameFile = useMutation(api.projectFiles.renameFile);
  const saveTextFile = useMutation(api.projectFiles.saveTextFile);

  const projectTree = tree as ProjectTreeNode[];
  const fileKey = `${projectId}:${selectedPath ?? ""}`;
  const previewTargetPath = useMemo(
    () =>
      selectPreviewTargetPath({
        entryFilePath: project?.entryFilePath ?? null,
        projectTree,
        selectedPath,
        selectedPathKind: activeFile?.kind ?? null,
      }),
    [activeFile?.kind, project?.entryFilePath, projectTree, selectedPath],
  );
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

  return {
    activeFile,
    editorValue,
    handleCreateFile,
    handleDeleteFile,
    handleRenameFile,
    handleUploadAsset,
    previewDoc,
    previewError,
    previewTargetPath,
    project,
    projectTree,
    saveState,
    selectedPath,
    setEditorValue,
    setSelectedPath,
  };
}
