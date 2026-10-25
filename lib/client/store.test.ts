import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { emptyLibrary, setAccountScope, type Library } from "./db";
import { deleteSet, getLibrary, importLibrary, overrideAnswer, recordAnswer, recordReview, restoreReview } from "./store";
import type { Attempt, StudySet } from "@/lib/study/types";

const set = (id: string, itemIds: string[]): StudySet => ({
  id, courseId: null, title: id, origin: "notes", createdAt: 0, updatedAt: 0, sections: [], sources: [], nextBatch: 0, notes: null, map: null, podcast: null,
  items: itemIds.map((i) => ({ id: i, kind: "short", prompt: "Q", answer: "a", quote: "", section: 1, explain: "", concept: "", status: "ok" })),
});
const attempt = (itemId: string, setId: string, at: number): Attempt => ({ itemId, setId, at, verdict: "right", confidence: "sure" });

beforeEach(async () => {
  setAccountScope("test-user");
  await importLibrary(emptyLibrary());
});

describe("deleteSet", () => {
  it("drops the set's attempts under both the old and the new key format", async () => {
    const lib: Library = {
      ...emptyLibrary(),
      sets: { s1: set("s1", ["i1"]), s2: set("s2", ["i2"]) },
      attempts: { "i1:100": attempt("i1", "s1", 100), a_new: attempt("i1", "s1", 200), "i2:300": attempt("i2", "s2", 300) },
    };
    await importLibrary(lib);
    deleteSet("s1");
    expect(Object.keys(getLibrary().attempts)).toEqual(["i2:300"]);
    expect(getLibrary().sets.s1).toBeUndefined();
  });
});

describe("recordAnswer", () => {
  it("logs the attempt under a fresh id with its details and reschedules", () => {
    recordAnswer("s1", "i1", "right", "sure", { mode: "practice", response: "x".repeat(1500), source: "local" }, 1000);
    const [[key, a]] = Object.entries(getLibrary().attempts);
    expect(key).not.toBe("i1:1000");
    expect(a).toMatchObject({ itemId: "i1", setId: "s1", at: 1000, verdict: "right", confidence: "sure", mode: "practice", source: "local" });
    expect(a.response).toHaveLength(1000);
    expect(getLibrary().cards.i1.reps).toBe(1);
  });

  it("still works with no details, as older callers send", () => {
    recordAnswer("s1", "i1", "wrong", "unsure");
    const [a] = Object.values(getLibrary().attempts);
    expect(a).toMatchObject({ verdict: "wrong", confidence: "unsure" });
    expect("mode" in a).toBe(false);
  });

  it("caps the grade", () => {
    recordAnswer("s1", "i1", "right", "sure", { mode: "gauge", cap: Rating.Good }, 1000);
    recordAnswer("s1", "i2", "right", "sure", { mode: "practice" }, 1000);
    expect(getLibrary().cards.i1.due).toBeLessThan(getLibrary().cards.i2.due);
  });

  it("logs an explain-back without rescheduling", () => {
    recordAnswer("s1", "i1", "partly", "unsure", { mode: "explain" }, 1000);
    expect(Object.values(getLibrary().attempts)).toHaveLength(1);
    expect(getLibrary().cards.i1).toBeUndefined();
  });
});

it("recordReview logs a self-rated attempt and reschedules", () => {
  recordReview("s1", "i1", Rating.Hard, 1000);
  const [a] = Object.values(getLibrary().attempts);
  expect(a).toMatchObject({ itemId: "i1", setId: "s1", at: 1000, verdict: "partly", confidence: "unsure", mode: "review", source: "self" });
  expect(getLibrary().cards.i1.reps).toBe(1);
});

describe("undoing a grade", () => {
  it("recordReview returns its attempt key, and restoreReview puts the old card back and drops that attempt", () => {
    recordReview("s1", "i1", Rating.Good, 1000);
    const before = getLibrary().cards.i1;
    const key = recordReview("s1", "i1", Rating.Again, 2000);
    expect(getLibrary().attempts[key]).toMatchObject({ itemId: "i1", at: 2000 });
    restoreReview("i1", before, key);
    expect(getLibrary().cards.i1).toEqual(before);
    expect(getLibrary().attempts[key]).toBeUndefined();
    expect(Object.values(getLibrary().attempts)).toHaveLength(1);
  });

  it("restoreReview drops the card when there was none before", () => {
    const key = recordReview("s1", "i1", Rating.Good, 1000);
    restoreReview("i1", null, key);
    expect(getLibrary().cards.i1).toBeUndefined();
    expect(getLibrary().attempts).toEqual({});
  });

  it("overrideAnswer swaps a wrong grade for a self-marked right one", () => {
    const key = recordAnswer("s1", "i1", "wrong", "sure", { mode: "practice", response: "glucose", source: "model" }, 1000);
    expect(typeof key).toBe("string");
    const next = overrideAnswer("s1", "i1", null, key, "sure", { mode: "practice", response: "glucose" }, 1000);
    const attempts = getLibrary().attempts;
    expect(attempts[key]).toBeUndefined();
    expect(Object.values(attempts)).toEqual([expect.objectContaining({ verdict: "right", confidence: "sure", mode: "practice", source: "self", response: "glucose" })]);
    expect(attempts[next]).toBeDefined();
    expect(getLibrary().cards.i1.reps).toBe(1);
  });
});
