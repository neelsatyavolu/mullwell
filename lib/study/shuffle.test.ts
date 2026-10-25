import { describe, expect, it } from "vitest";
import { choiceOrder, seededShuffle, seedFor } from "./shuffle";
import type { Item } from "./types";

const mcq = (id: string, n = 4): Item => ({
  id, kind: "mcq", prompt: "Q", choices: Array.from({ length: n }, (_, i) => `c${i}`), correct: 0, answer: "c0", quote: "", section: 1, explain: "", concept: "", status: "ok",
});

describe("seededShuffle", () => {
  it("returns a permutation without touching the input", () => {
    const list = [1, 2, 3, 4, 5];
    const out = seededShuffle(list, 42);
    expect([...out].sort()).toEqual(list);
    expect(list).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("choiceOrder", () => {
  it("is a permutation of the choice indices", () => {
    for (const n of [3, 4, 6]) expect([...choiceOrder(mcq("q", n), 7)].sort()).toEqual(Array.from({ length: n }, (_, i) => i));
  });

  it("gives the same order for the same seed", () => {
    expect(choiceOrder(mcq("q"), seedFor("q", 2))).toEqual(choiceOrder(mcq("q"), seedFor("q", 2)));
  });

  it("changes the order between presentations of a 4-choice item", () => {
    for (const id of ["q1", "item-abc", "x"]) {
      expect(choiceOrder(mcq(id), seedFor(id, 0))).not.toEqual(choiceOrder(mcq(id), seedFor(id, 1)));
      const orders = new Set([0, 1, 2, 3, 4, 5].map((n) => choiceOrder(mcq(id), seedFor(id, n)).join()));
      expect(orders.size).toBeGreaterThanOrEqual(3);
    }
  });

  it("is empty for questions without choices", () => {
    expect(choiceOrder({ ...mcq("q"), kind: "short", choices: undefined }, 1)).toEqual([]);
  });
});

describe("seedFor", () => {
  it("depends on both the id and the count", () => {
    expect(seedFor("a", 0)).toBe(seedFor("a", 0));
    expect(seedFor("a", 0)).not.toBe(seedFor("a", 1));
    expect(seedFor("a", 0)).not.toBe(seedFor("b", 0));
  });
});
