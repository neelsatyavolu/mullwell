import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { daysUntil, missedConcepts, perDay, pickPracticeTest, readiness, reviewPlan, type ExamItem } from "./exam";
import { newCard, review } from "./schedule";
import type { Attempt } from "./types";

const item = (id: string, setId = "s1", concept = id): ExamItem => ({
  id, setId, kind: "short", prompt: `Q ${id}`, answer: "a", quote: "", section: 1, explain: "", concept, status: "ok",
});
const at = (itemId: string, verdict: Attempt["verdict"], when = 1): Attempt => ({ itemId, setId: "s1", at: when, verdict, confidence: "sure" });

describe("readiness", () => {
  it("counts recalled, shaky and untried from the latest attempt", () => {
    const items = [item("a"), item("b"), item("c")];
    const r = readiness(items, [at("a", "wrong", 1), at("a", "right", 2), at("b", "partly")]);
    expect(r).toEqual({ total: 3, recalled: 1, shaky: 1, untried: 1 });
  });
});

describe("reviewPlan", () => {
  it("lists what will likely be forgotten by test day, never-studied first", () => {
    const now = Date.UTC(2026, 9, 1);
    const testAt = now + 20 * 86_400_000;
    const strong = review(review(newCard(now), Rating.Easy, now), Rating.Easy, now + 15 * 86_400_000);
    const weak = review(newCard(now), Rating.Hard, now);
    const cards = new Map([["strong", strong], ["weak", weak]]);
    const plan = reviewPlan([item("strong"), item("weak"), item("new")], cards, testAt).map((i) => i.id);
    expect(plan[0]).toBe("new");
    expect(plan).toContain("weak");
  });
});

describe("pickPracticeTest", () => {
  it("leans on weak questions and interleaves sets", () => {
    const items = [item("a", "s1"), item("b", "s1"), item("c", "s2"), item("d", "s2"), item("e", "s1"), item("f", "s2")];
    const attempts = [at("a", "right"), at("b", "right"), at("c", "right")];
    const test = pickPracticeTest(items, attempts, 4, 42);
    expect(test).toHaveLength(4);
    expect(test.filter((i) => ["d", "e", "f"].includes(i.id)).length).toBeGreaterThanOrEqual(2);
    for (let k = 1; k < test.length; k++) if (test[k].setId === test[k - 1].setId) {
      // Only allowed once one set has run out.
      expect(new Set(test.slice(k).map((i) => i.setId)).size).toBe(1);
    }
    expect(pickPracticeTest(items, attempts, 4, 42).map((i) => i.id)).toEqual(test.map((i) => i.id));
  });

  it("returns everything when asked for more than exists", () => {
    expect(pickPracticeTest([item("a"), item("b")], [], 10, 1)).toHaveLength(2);
  });
});

it("daysUntil counts calendar days", () => {
  const now = new Date(2026, 9, 24, 22, 0).getTime();
  expect(daysUntil("2026-10-24", now)).toBe(0);
  expect(daysUntil("2026-10-27", now)).toBe(3);
  expect(daysUntil("2026-10-20", now)).toBe(-4);
});

it("perDay and missedConcepts", () => {
  expect(perDay(10, 3)).toBe(4);
  expect(perDay(10, 0)).toBe(10);
  expect(missedConcepts([
    { item: item("a", "s", "ATP"), verdict: "wrong" },
    { item: item("b", "s", "Krebs"), verdict: "partly" },
    { item: item("c", "s", "ATP"), verdict: "wrong" },
    { item: item("d", "s", "DNA"), verdict: "right" },
  ])).toEqual(["ATP", "Krebs"]);
});
