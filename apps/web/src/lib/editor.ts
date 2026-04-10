import type { ProjectTreeNode } from "@app/backend";

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

export function findFirstFilePath(nodes: ProjectTreeNode[]): string | null {
  for (const node of nodes) {
    if (node.type === "file") {
      return node.path;
    }

    if (node.children) {
      const childPath = findFirstFilePath(node.children);

      if (childPath) {
        return childPath;
      }
    }
  }

  return null;
}

export function guessTextMimeType(path: string): string {
  if (path.endsWith(".md") || path.endsWith(".mdx")) {
    return "text/markdown";
  }

  if (path.endsWith(".json")) {
    return "application/json";
  }

  if (path.endsWith(".html")) {
    return "text/html";
  }

  if (path.endsWith(".css")) {
    return "text/css";
  }

  return "text/plain";
}

export async function sha256ForArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
