import { describe, expect, it } from "vitest";
import { batches, guessTitle, splitLong, toSections } from "./chunk";

describe("toSections", () => {
  it("starts a section at each heading and numbers them", () => {
    const s = toSections("# Cells\nCells are the unit of life. ".repeat(1) + "\n\n## Mitochondria\nThey make ATP through respiration in the inner membrane.");
    expect(s.map((x) => [x.id, x.title])).toEqual([[1, "Cells"], [2, "Mitochondria"]]);
    expect(s[1].text).toContain("make ATP");
  });

  it("titles untitled text from its first words and merges tiny fragments", () => {
    const s = toSections("Photosynthesis turns light into chemical energy.\n\nIt happens in chloroplasts.");
    expect(s).toHaveLength(1);
    expect(s[0].title).toMatch(/^Photosynthesis turns light/);
  });

  it("splits long sections at paragraph breaks", () => {
    const para = "Word ".repeat(300).trim();
    const s = toSections(`# Long\n${para}\n\n${para}\n\n${para}`);
    expect(s.length).toBeGreaterThan(1);
    expect(s.every((x) => x.text.length <= 2400)).toBe(true);
    expect(s[0].title).toBe("Long (1)");
  });

  it("returns nothing for blank input", () => {
    expect(toSections("  \n ")).toEqual([]);
  });
});

describe("splitLong", () => {
  it("breaks a single huge paragraph by sentences and words", () => {
    const text = "This is a sentence. ".repeat(400);
    const parts = splitLong(text, 500);
    expect(parts.every((p) => p.length <= 500)).toBe(true);
    expect(parts.join(" ").replace(/\s+/g, " ").trim()).toBe(text.trim());
  });
});

describe("batches", () => {
  it("groups consecutive sections under the budget", () => {
    const s = [1, 2, 3].map((id) => ({ id, title: "t", text: "x".repeat(400) }));
    expect(batches(s, 900).map((b) => b.map((x) => x.id))).toEqual([[1, 2], [3]]);
  });
});

describe("guessTitle", () => {
  it("prefers the first heading", () => {
    expect(guessTitle("intro\n## The Krebs cycle\nmore")).toBe("The Krebs cycle");
    expect(guessTitle("Short note")).toBe("Short note");
  });
});
