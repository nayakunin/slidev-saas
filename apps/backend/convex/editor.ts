export const projectFileKinds = ["text", "asset"] as const;
export type ProjectFileKind = (typeof projectFileKinds)[number];

export interface ProjectFileSummary {
  path: string;
  name: string;
  kind: ProjectFileKind;
  mimeType?: string | null;
  sizeBytes: number;
  revision: number;
  updatedAt: number;
  downloadUrl?: string | null;
}

export interface ProjectTreeNode {
  name: string;
  path: string;
  type: "directory" | "file";
  kind?: ProjectFileKind;
  mimeType?: string | null;
  sizeBytes?: number;
  revision?: number;
  updatedAt?: number;
  downloadUrl?: string | null;
  children?: ProjectTreeNode[];
}

export function normalizeProjectPath(input: string): string {
  const normalized = input.trim().replace(/^\/+|\/+$/g, "");

  if (!normalized) {
    throw new Error("File path cannot be empty.");
  }

  const segments = normalized.split("/").filter(Boolean);

  if (segments.length === 0) {
    throw new Error("File path cannot be empty.");
  }

  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new Error("Relative path segments are not allowed.");
    }
  }

  return segments.join("/");
}

export function buildProjectTree(files: ProjectFileSummary[]): ProjectTreeNode[] {
  const root: ProjectTreeNode[] = [];
  const directories = new Map<string, ProjectTreeNode>();

  const ensureDirectory = (path: string): ProjectTreeNode[] => {
    if (!path) {
      return root;
    }

    const existing = directories.get(path);
    if (existing) {
      return existing.children ?? [];
    }

    const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const parentChildren = ensureDirectory(parentPath);
    const node: ProjectTreeNode = {
      name: path.slice(path.lastIndexOf("/") + 1),
      path,
      type: "directory",
      children: [],
    };
    parentChildren.push(node);
    directories.set(path, node);
    return node.children ?? [];
  };

  const sortedFiles = [...files].sort((left, right) =>
    left.path.localeCompare(right.path),
  );

  for (const file of sortedFiles) {
    const normalizedPath = normalizeProjectPath(file.path);
    const parentPath = normalizedPath.includes("/")
      ? normalizedPath.slice(0, normalizedPath.lastIndexOf("/"))
      : "";
    const children = ensureDirectory(parentPath);

    children.push({
      name: file.name,
      path: normalizedPath,
      type: "file",
      kind: file.kind,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      revision: file.revision,
      updatedAt: file.updatedAt,
      downloadUrl: file.downloadUrl,
    });
  }

  const sortNodes = (nodes: ProjectTreeNode[]) => {
    nodes.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === "directory" ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });

    for (const node of nodes) {
      if (node.children) {
        sortNodes(node.children);
      }
    }
  };

  sortNodes(root);

  return root;
}
