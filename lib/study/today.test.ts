import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { interleaveBySet, type ExamItem } from "./exam";
import { newCard, review, type StoredCard } from "./schedule";
import { todayQueue } from "./today";
import type { Attempt, Exam } from "./types";

const DAY = 86_400_000;
// Local noon, so "today" is the same calendar day whatever the time zone.
const NOW = new Date(2026, 9, 1, 12).getTime();

const item = (id: string, setId = "s1"): ExamItem => ({
  id, setId, kind: "short", prompt: id, answer: "a", quote: "", section: 1, explain: "", concept: "", status: "ok",
});
const attempt = (itemId: string, at: number): Attempt => ({ itemId, setId: "s1", at, verdict: "right", confidence: "sure" });
/** A card last reviewed `ago` ms before now, due `due` ms from now (negative: overdue). */
const card = (due: number, ago = DAY): StoredCard => ({ ...review(newCard(NOW - ago), Rating.Good, NOW - ago), due: NOW + due });
/** A local YYYY-MM-DD date `days` from NOW. */
const dateIn = (days: number) => {
  const d = new Date(NOW + days * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const exam = (id: string, setIds: string[], days: number): Exam => ({ id, courseId: "c1", name: id, date: dateIn(days), setIds, createdAt: 0 });
const base = { attempts: [] as Attempt[], exams: [] as Exam[], now: NOW, newPerDay: 10, cap: 30 };
const ids = (xs: ExamItem[]) => xs.map((i) => i.id);

describe("interleaveBySet", () => {
  it("alternates sets in order of first appearance, keeping each set's order", () => {
    const out = interleaveBySet([item("a1", "a"), item("a2", "a"), item("a3", "a"), item("b1", "b"), item("c1", "c")]);
    expect(ids(out)).toEqual(["a1", "b1", "c1", "a2", "a3"]);
  });
});

describe("todayQueue", () => {
  it("lists due cards most overdue first and leaves out ones not yet due", () => {
    const items = [item("soon"), item("late"), item("later"), item("notyet")];
    const cards = { soon: card(-1000), late: card(-2 * DAY), later: card(-DAY), notyet: card(DAY) };
    const q = todayQueue({ ...base, items, cards, attempts: items.map((i) => attempt(i.id, NOW - 3 * DAY)) });
    expect(ids(q.due)).toEqual(["late", "later", "soon"]);
    expect(q.fresh).toEqual([]);
  });

  it("introduces untried questions up to the daily budget, less those first tried today", () => {
    const items = [item("t1"), item("t2"), item("y1"), item("n1"), item("n2"), item("n3")];
    const cards = { t1: card(DAY, 0), t2: card(DAY, 0), y1: card(DAY) };
    const attempts = [attempt("t1", NOW - 1000), attempt("t2", NOW - 2000), attempt("y1", NOW - DAY), attempt("y1", NOW - 500)];
    const q = todayQueue({ ...base, items, cards, attempts, newPerDay: 3 });
    expect(ids(q.fresh)).toEqual(["n1"]);
    expect(todayQueue({ ...base, items, cards, attempts, newPerDay: 2 }).fresh).toEqual([]);
  });

  it("doesn't count a card whose first logged answer today is a review as a new question", () => {
    // A card from before reviews were logged: its first attempt is today's review.
    const items = [item("old"), item("n1"), item("n2")];
    const cards = { old: card(DAY, 0) };
    const attempts: Attempt[] = [{ ...attempt("old", NOW - 1000), mode: "review", source: "self" }];
    expect(ids(todayQueue({ ...base, items, cards, attempts, newPerDay: 1 }).fresh)).toEqual(["n1"]);
  });

  it("fills the new-question budget from the nearest test's sets first", () => {
    const items = [item("c1", "c"), item("c2", "c"), item("d1", "d"), item("d2", "d")];
    const exams = [exam("near", ["c"], 10), exam("nearer", ["d"], 5)];
    // Each test's plan adds its first question; the one budgeted question comes from d.
    const q = todayQueue({ ...base, items, cards: {}, exams, newPerDay: 1 });
    expect(new Set(ids(q.fresh))).toEqual(new Set(["c1", "d1", "d2"]));
  });

  it("prefers sets with a test in the next two weeks, nearest first, then takes turns across sets", () => {
    const items = [item("a1", "a"), item("a2", "a"), item("b1", "b"), item("b2", "b"), item("c1", "c"), item("c2", "c"), item("d1", "d"), item("d2", "d")];
    const exams = [exam("far", ["b"], 30), exam("near", ["c"], 10), exam("nearer", ["d"], 5)];
    const q = todayQueue({ ...base, items, cards: {}, exams, newPerDay: 4 });
    // Each test's plan for today adds one question; the budget of 4 then fills from d, c, then a and b in turn.
    expect(new Set(ids(q.fresh))).toEqual(new Set(["d1", "c1", "b1", "d2", "c2", "a1", "b2"]));
  });

  it("merges each upcoming test's plan for today without repeating a question", () => {
    const items = [item("due1"), item("weak"), item("new1"), item("old", "x")];
    const cards = { due1: card(-DAY), weak: card(10 * DAY, 30 * DAY) };
    const attempts = [attempt("due1", NOW - 5 * DAY), attempt("weak", NOW - 30 * DAY)];
    const exams = [exam("t1", ["s1"], 1), exam("past", ["x"], -3)];
    const q = todayQueue({ ...base, items, cards, attempts, exams, newPerDay: 0 });
    expect(ids(q.due).sort()).toEqual(["due1", "weak"]);
    expect(ids(q.fresh)).toEqual(["new1"]);
  });

  it("leaves a test's plan out once today's share of it has been studied", () => {
    const items = [item("p1"), item("p2"), item("p3"), item("p4")];
    const cards = { p1: card(3 * DAY, 0), p2: card(3 * DAY, 0) };
    const attempts = [attempt("p1", NOW - 1000), attempt("p2", NOW - 1000)];
    // 4 questions over 2 days is 2 a day, and 2 were studied today.
    const q = todayQueue({ ...base, items, cards, attempts, exams: [exam("t", ["s1"], 2)], newPerDay: 0 });
    expect(q.fresh).toEqual([]);
  });

  it("caps the session, keeping reviews before new questions, and interleaves sets", () => {
    const items = [item("a1", "a"), item("a2", "a"), item("a3", "a"), item("b1", "b"), item("n1", "a"), item("n2", "b")];
    const cards = { a1: card(-4 * DAY), a2: card(-3 * DAY), a3: card(-2 * DAY), b1: card(-DAY) };
    const attempts = ["a1", "a2", "a3", "b1"].map((id) => attempt(id, NOW - 9 * DAY));
    const q = todayQueue({ ...base, items, cards, attempts, cap: 5 });
    expect(ids(q.due)).toEqual(["a1", "b1", "a2", "a3"]);
    expect(ids(q.fresh)).toEqual(["n1"]);
    expect(todayQueue({ ...base, items, cards, attempts, cap: 2 })).toEqual({ due: [items[0], items[1]], fresh: [] });
  });
});
