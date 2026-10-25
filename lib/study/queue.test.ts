import { describe, expect, it } from "vitest";
import { Rating, type Grade } from "ts-fsrs";
import { orderForPractice, requeue } from "./queue";
import { newCard, review, type StoredCard } from "./schedule";
import type { ExamItem } from "./exam";
import type { Attempt, ItemStatus, Verdict } from "./types";

const DAY = 86_400_000;
const NOW = 100 * DAY;

const item = (id: string, status: ItemStatus = "ok"): ExamItem => ({
  id, setId: "s1", kind: "short", prompt: id, answer: "a", quote: "", section: 1, explain: "", concept: "", status,
});
const attempt = (itemId: string, verdict: Verdict, at = NOW - DAY): Attempt => ({ itemId, setId: "s1", at, verdict, confidence: "unsure" });
/** A card reviewed `ago` ms before now with the given grade. */
const studied = (ago: number, grade: Grade = Rating.Good): StoredCard => review(newCard(NOW - ago), grade, NOW - ago);

describe("orderForPractice", () => {
  it("puts never-tried questions first, in the order they were written", () => {
    const items = [item("known"), item("new1"), item("new2")];
    const cards = { known: studied(DAY) };
    const out = orderForPractice(items, cards, [attempt("known", "right")], NOW);
    expect(out.map((i) => i.id)).toEqual(["new1", "new2", "known"]);
  });

  it("puts last-missed questions before due ones, and due ones before the rest", () => {
    const items = [item("fresh"), item("due"), item("missed"), item("partly")];
    const cards = { fresh: studied(DAY), due: studied(30 * DAY), missed: studied(DAY, Rating.Again), partly: studied(DAY, Rating.Hard) };
    const attempts = [attempt("fresh", "right"), attempt("due", "right"), attempt("missed", "wrong"), attempt("partly", "partly")];
    const out = orderForPractice(items, cards, attempts, NOW).map((i) => i.id);
    expect(out.slice(0, 2).sort()).toEqual(["missed", "partly"]);
    expect(out.slice(2)).toEqual(["due", "fresh"]);
  });

  it("goes by the latest verdict, so a fixed miss isn't counted as missed", () => {
    const items = [item("a"), item("b")];
    const cards = { a: studied(DAY), b: studied(DAY) };
    const attempts = [attempt("a", "wrong", NOW - 2 * DAY), attempt("a", "right", NOW - DAY), attempt("b", "wrong")];
    expect(orderForPractice(items, cards, attempts, NOW).map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("orders due cards by how likely they are to be forgotten", () => {
    const items = [item("week"), item("month")];
    const cards = { week: studied(20 * DAY), month: studied(60 * DAY) };
    const attempts = [attempt("week", "right"), attempt("month", "right")];
    expect(orderForPractice(items, cards, attempts, NOW).map((i) => i.id)).toEqual(["month", "week"]);
  });

  it("keeps questions still being checked after the ready ones and leaves out dropped ones", () => {
    const items = [item("checking", "checking"), item("gone", "dropped"), item("ok")];
    expect(orderForPractice(items, {}, [], NOW).map((i) => i.id)).toEqual(["ok", "checking"]);
  });

  it("doesn't change its input", () => {
    const items = [item("b"), item("a")];
    const copy = [...items];
    orderForPractice(items, { b: studied(DAY) }, [attempt("b", "right")], NOW);
    expect(items).toEqual(copy);
  });
});

describe("requeue", () => {
  it("brings a question back after `gap` others", () => {
    expect(requeue(["a", "b", "c", "d", "e"], "x", 3)).toEqual(["a", "b", "c", "x", "d", "e"]);
  });

  it("defaults to a gap of 3", () => {
    expect(requeue(["a", "b", "c", "d"], "x")).toEqual(["a", "b", "c", "x", "d"]);
  });

  it("goes last when fewer than `gap` questions are left", () => {
    expect(requeue(["a"], "x", 3)).toEqual(["a", "x"]);
    expect(requeue([], "x", 3)).toEqual(["x"]);
  });

  it("moves an id that's already queued instead of doubling it, without touching the input", () => {
    const queue = ["x", "a", "b", "c", "d"];
    expect(requeue(queue, "x", 2)).toEqual(["a", "b", "x", "c", "d"]);
    expect(queue).toEqual(["x", "a", "b", "c", "d"]);
  });
});
