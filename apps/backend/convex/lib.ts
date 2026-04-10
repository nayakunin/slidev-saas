import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { normalizeProjectPath } from "./editor";

export const TEMPLATE_VERSION = "v1";
export const ENTRY_FILE_PATH = "slides.md";
export const MAX_INLINE_TEXT_BYTES = 900_000;

export interface TemplateFile {
  path: string;
  content: string;
  mimeType: string;
}

export const templateFiles: TemplateFile[] = [
  {
    path: "slides.md",
    mimeType: "text/markdown",
    content: `---
marp: true
title: Welcome to your deck
---

# Welcome

Edit this file and the preview will update instantly.

---

## Next Steps

- Create new slides
- Add assets into \`public/\`
- Reference uploaded images with their Convex storage URL
`,
  },
  {
    path: "public/.gitkeep",
    mimeType: "text/plain",
    content: "",
  },
];

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "presentation";
}

export async function sha256Hex(value: string | ArrayBuffer): Promise<string> {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildTextFileRecord({
  projectId,
  path,
  content,
  mimeType,
  now,
}: {
  projectId: Id<"projects">;
  path: string;
  content: string;
  mimeType: string;
  now: number;
}) {
  const normalizedPath = normalizeProjectPath(path);
  const sizeBytes = new TextEncoder().encode(content).byteLength;

  if (sizeBytes > MAX_INLINE_TEXT_BYTES) {
    throw new Error("Text file is too large to store inline.");
  }

  return {
    projectId,
    path: normalizedPath,
    kind: "text" as const,
    mimeType,
    sizeBytes,
    sha256: await sha256Hex(content),
    revision: 1,
    textContent: content,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getFileByPath(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  path: string,
) {
  const normalizedPath = normalizeProjectPath(path);

  return await ctx.db
    .query("projectFiles")
    .withIndex("by_project_path", (query) =>
      query.eq("projectId", projectId).eq("path", normalizedPath),
    )
    .unique();
}
