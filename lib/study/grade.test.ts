import { describe, expect, it } from "vitest";
import { editDistance, gradeLocally } from "./grade";
import type { Item } from "./types";

const base: Item = { id: "1", kind: "cloze", prompt: "The ____ makes ATP.", answer: "mitochondrion", quote: "", section: 1, explain: "", concept: "", status: "ok" };

describe("gradeLocally", () => {
  it("grades multiple choice by index", () => {
    const mcq: Item = { ...base, kind: "mcq", choices: ["a", "b", "c", "d"], correct: 2, answer: "c" };
    expect(gradeLocally(mcq, 2)).toBe("right");
    expect(gradeLocally(mcq, "0")).toBe("wrong");
  });

  it("accepts a cloze answer with a small typo and defers other wording to the model", () => {
    expect(gradeLocally(base, "Mitochondrion")).toBe("right");
    expect(gradeLocally(base, "mitocondrion")).toBe("right");
    expect(gradeLocally(base, "the mitochondria organelle")).toBeNull();
    expect(gradeLocally(base, "  ")).toBe("wrong");
    expect(gradeLocally({ ...base, answer: "ATP" }, "ADP")).toBeNull();
  });

  it("never fuzzes numbers or signs", () => {
    const num = { ...base, answer: "-5" };
    expect(gradeLocally(num, "-5")).toBe("right");
    expect(gradeLocally(num, "5")).toBeNull();
    expect(gradeLocally({ ...base, answer: "10000" }, "10001")).toBeNull();
  });

  it("defers short answers to the model", () => {
    expect(gradeLocally({ ...base, kind: "short" }, "anything")).toBeNull();
  });
});

it("editDistance", () => {
  expect(editDistance("kitten", "sitting")).toBe(3);
  expect(editDistance("", "abc")).toBe(3);
});
