import {
  getExportFileName,
  getExportMimeType,
  getExportObjectKey,
} from "@app/backend/export-contract";
import { describe, expect, it } from "vitest";

describe("export contract helpers", () => {
  it("builds deterministic object keys", () => {
    expect(
      getExportObjectKey({
        projectId: "project_123",
        format: "pdf",
        fingerprint: "fingerprint_456",
      }),
    ).toBe("exports/project_123/pdf/fingerprint_456/v1.pdf");
  });

  it("derives file names and mime types from the export format", () => {
    expect(getExportFileName({ title: "My Deck", format: "pdf" })).toBe("my-deck.pdf");
    expect(getExportMimeType("pptx")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
  });
});
