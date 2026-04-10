import { describe, expect, it } from "vitest";

import { findFirstFilePath, normalizeProjectPath } from "./editor";

describe("editor helpers", () => {
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
});
