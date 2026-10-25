import { describe, expect, it } from "vitest";
import { acknowledge, changeKey, enqueue, remoteWins, toBatches, type SyncChange } from "./sync";

const c = (id: string, updatedAt: number, data: unknown = { v: updatedAt }): SyncChange => ({ kind: "sets", id, data, updatedAt });

describe("outbox", () => {
  it("keeps only the newest change per record", () => {
    let box = enqueue(new Map(), c("a", 1));
    box = enqueue(box, c("a", 3));
    box = enqueue(box, c("a", 2));
    box = enqueue(box, c("b", 1));
    expect([...box.values()].map((x) => [x.id, x.updatedAt])).toEqual([["a", 3], ["b", 1]]);
  });

  it("acknowledges only what was sent and not superseded", () => {
    const first = c("a", 1);
    let box = enqueue(enqueue(new Map(), first), c("b", 1));
    const sent = [...box.values()];
    box = enqueue(box, c("a", 5));
    const left = acknowledge(box, sent);
    expect([...left.values()].map((x) => [x.id, x.updatedAt])).toEqual([["a", 5]]);
  });
});

describe("remoteWins", () => {
  it("lets the server win unless a newer local change is pending", () => {
    const box = enqueue(new Map(), c("a", 10));
    expect(remoteWins(c("a", 9), box)).toBe(false);
    expect(remoteWins(c("a", 11), box)).toBe(true);
    expect(remoteWins(c("z", 1), box)).toBe(true);
  });
});

describe("toBatches", () => {
  it("respects count and size limits", () => {
    const list = [c("a", 1), c("b", 1), c("c", 1, { big: "x".repeat(500) })];
    expect(toBatches(list, 2, 10_000).map((b) => b.length)).toEqual([2, 1]);
    expect(toBatches(list, 10, 300).map((b) => b.map((x) => x.id))).toEqual([["a", "b"], ["c"]]);
    expect(toBatches([], 2, 10)).toEqual([]);
  });
});

it("changeKey separates kind and id", () => {
  expect(changeKey({ kind: "sets", id: "a" })).not.toBe(changeKey({ kind: "set", id: "sa" }));
});
