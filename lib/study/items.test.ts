import { describe, expect, it } from "vitest";
import { editAnswer, isDuplicate, passesCheck, suspend, toItem, unsuspend } from "./items";

const sections = [{ id: 1, title: "Resp", text: "Glycolysis happens in the cytoplasm and splits glucose into two pyruvate molecules." }];
const quote = "Glycolysis happens in the cytoplasm and splits glucose";

describe("toItem", () => {
  it("keeps a grounded multiple-choice question and fills its answer", () => {
    const item = toItem({ kind: "mcq", prompt: "Where does glycolysis happen?", choices: ["Nucleus", "Cytoplasm", "Mitochondria", "Ribosome"], correct: 1, quote, section: 1 }, sections, "q1");
    expect(item).toMatchObject({ id: "q1", answer: "Cytoplasm", correct: 1, status: "checking", section: 1 });
  });

  it("drops a question whose quote is not in the material", () => {
    expect(toItem({ kind: "short", prompt: "What makes ATP?", answer: "ATP synthase", quote: "ATP synthase spins to make ATP from ADP", section: 1 }, sections, "q")).toBeNull();
  });

  it("drops malformed multiple choice and blanks without a gap", () => {
    expect(toItem({ kind: "mcq", prompt: "Where does it happen?", choices: ["A", "A", "B", "C"], correct: 0, quote, section: 1 }, sections, "q")).toBeNull();
    expect(toItem({ kind: "mcq", prompt: "Where does it happen?", choices: ["A", "B", "C", "D"], correct: 7, quote, section: 1 }, sections, "q")).toBeNull();
    expect(toItem({ kind: "cloze", prompt: "Glycolysis happens in the cytoplasm.", answer: "cytoplasm", quote, section: 1 }, sections, "q")).toBeNull();
    expect(toItem({ kind: "short", prompt: "What happens?", answer: "", quote, section: 1 }, sections, "q")).toBeNull();
    expect(toItem("nope", sections, "q")).toBeNull();
  });

  it("accepts a cloze with a gap and numeric strings", () => {
    expect(toItem({ kind: "cloze", prompt: "Glycolysis happens in the ____.", answer: "cytoplasm", quote, section: "1" }, sections, "q")?.kind).toBe("cloze");
  });
});

describe("passesCheck", () => {
  const mcq = toItem({ kind: "mcq", prompt: "Where does glycolysis happen?", choices: ["Nucleus", "Cytoplasm", "Mitochondria", "Ribosome"], correct: 1, quote, section: 1 }, sections, "q1")!;
  it("needs the checker to pick the same choice, find support and see no ambiguity", () => {
    expect(passesCheck(mcq, { id: "q1", answer: "1", supported: true, ambiguous: false })).toBe(true);
    expect(passesCheck(mcq, { id: "q1", answer: "2", supported: true, ambiguous: false })).toBe(false);
    expect(passesCheck(mcq, { id: "q1", answer: 1, supported: true, ambiguous: true })).toBe(false);
    expect(passesCheck(mcq, { id: "q1", answer: 1, supported: false })).toBe(false);
    expect(passesCheck(mcq, { id: "other", answer: 1, supported: true })).toBe(false);
    expect(passesCheck(mcq, null)).toBe(false);
    expect(passesCheck({ ...mcq, correct: 0 }, { id: "q1", answer: "", supported: true })).toBe(false);
  });
});

it("isDuplicate ignores case and punctuation", () => {
  const item = toItem({ kind: "short", prompt: "Where does glycolysis happen?", answer: "Cytoplasm", quote, section: 1 }, sections, "q")!;
  expect(isDuplicate("where does glycolysis happen", [item])).toBe(true);
  expect(isDuplicate("What does glycolysis make?", [item])).toBe(false);
});

describe("fixing a bad question", () => {
  const short = { id: "q", kind: "short" as const, prompt: "What makes ATP?", answer: "ATP synthase", quote, section: 1, explain: "", concept: "", status: "ok" as const };

  it("suspends with a report and unsuspends without one", () => {
    const s = suspend(short, "unclear", 5);
    expect(s).toMatchObject({ status: "suspended", report: { reason: "unclear", at: 5 } });
    expect(short.status).toBe("ok");
    const back = unsuspend(s);
    expect(back.status).toBe("ok");
    expect("report" in back).toBe(false);
  });

  it("edits a short or cloze answer and marks it edited, leaving the prompt and quote", () => {
    expect(editAnswer(short, "  The ATP synthase enzyme ")).toEqual({ ...short, answer: "The ATP synthase enzyme", edited: true });
  });

  it("ignores blank edits and multiple choice", () => {
    expect(editAnswer(short, "   ")).toBe(short);
    const mcq = { ...short, kind: "mcq" as const, choices: ["a", "b", "c"], correct: 0, answer: "a" };
    expect(editAnswer(mcq, "b")).toBe(mcq);
  });
});
