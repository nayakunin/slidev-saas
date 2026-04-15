import { describe, expect, it } from "vitest";

import {
  buildPreviewDocument,
  findFirstFilePath,
  guessTextMimeType,
  normalizeProjectPath,
  selectPreviewTargetPath,
} from "./editor";

describe("project editor helpers", () => {
  it("normalizes nested project paths", () => {
    expect(normalizeProjectPath("/public//images/hero.png/")).toBe("public/images/hero.png");
  });

  it("finds the first file in a project tree", () => {
    const tree = [
      {
        type: "directory" as const,
        path: "public",
        name: "public",
        children: [
          {
            type: "file" as const,
            path: "public/logo.png",
            name: "logo.png",
            kind: "asset" as const,
            sizeBytes: 12,
            revision: 1,
            updatedAt: 1,
          },
        ],
      },
      {
        type: "file" as const,
        path: "slides.md",
        name: "slides.md",
        kind: "text" as const,
        sizeBytes: 10,
        revision: 1,
        updatedAt: 1,
      },
    ];

    expect(findFirstFilePath(tree)).toBe("public/logo.png");
  });

  it("prefers the configured entry file for preview", () => {
    const projectTree = [
      {
        type: "file" as const,
        path: "slides.md",
        name: "slides.md",
        kind: "text" as const,
        sizeBytes: 10,
        revision: 1,
        updatedAt: 1,
      },
      {
        type: "file" as const,
        path: "notes.md",
        name: "notes.md",
        kind: "text" as const,
        sizeBytes: 10,
        revision: 1,
        updatedAt: 1,
      },
    ];

    expect(
      selectPreviewTargetPath({
        entryFilePath: "slides.md",
        projectTree,
        selectedPath: "notes.md",
        selectedPathKind: "text",
      }),
    ).toBe("slides.md");
  });

  it("guesses markdown and fallback mime types", () => {
    expect(guessTextMimeType("deck.md")).toBe("text/markdown");
    expect(guessTextMimeType("notes.txt")).toBe("text/plain");
  });

  it("builds a standalone preview document", () => {
    const document = buildPreviewDocument({
      css: "body{color:red;}",
      html: "<main>slides</main>",
    });

    expect(document).toContain("<style>body{color:red;}</style>");
    expect(document).toContain("<body><main>slides</main></body>");
  });
});
