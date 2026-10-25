import { expect, it, vi } from "vitest";

vi.mock("pdfjs-dist", () => ({}));

it("baseName turns a file name into a readable placeholder", async () => {
  const { baseName } = await import("@/lib/client/extract");
  expect(baseName("S_D6Elasticity.pdf")).toBe("S D6 Elasticity");
  expect(baseName("unit-3_cellRespiration notes.md")).toBe("unit 3 cell Respiration notes");
  expect(baseName(".pdf")).toBe("Untitled set");
});
