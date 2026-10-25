import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { emptyLibrary, type Library } from "./db";
import { attemptCounts, courseDue, dueItems, readyItems, setStats, todayItems } from "./derived";
import { newCard, review } from "@/lib/study/schedule";
import type { Attempt, Lesson, LessonStep, StudySet } from "@/lib/study/types";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 1);

const attempt = (itemId: string, at: number): Attempt => ({ itemId, setId: "s1", at, verdict: "right", confidence: "sure" });
const set = (id: string, itemIds: string[], extra: Partial<StudySet> = {}): StudySet => ({
  id, courseId: null, title: id, origin: "notes", createdAt: 0, updatedAt: 0, sections: [], sources: [], nextBatch: 0, notes: null, map: null, podcast: null,
  items: itemIds.map((i) => ({ id: i, kind: "short", prompt: "Q", answer: "a", quote: "", section: 1, explain: "", concept: "", status: "ok" })),
  ...extra,
});
const step = (title: string, status: LessonStep["status"]): LessonStep => ({
  id: title, title, goal: "", sections: [1], probeId: null, familiarity: null, explanations: [], checkpointIds: [], tries: 0, status,
});

describe("attemptCounts", () => {
  it("counts attempts per question across both key formats", () => {
    const lib = { ...emptyLibrary(), attempts: { "i1:100": attempt("i1", 100), a_x: attempt("i1", 200), a_y: attempt("i2", 300) } };
    const counts = attemptCounts(lib);
    expect(counts.get("i1")).toBe(2);
    expect(counts.get("i2")).toBe(1);
    expect(counts.get("i3")).toBeUndefined();
  });
});

describe("setStats", () => {
  const lib: Library = {
    ...emptyLibrary(),
    sets: { s1: set("s1", ["fresh", "due", "new"]) },
    cards: { fresh: review(newCard(NOW), Rating.Easy, NOW), due: review(newCard(NOW - 60 * DAY), Rating.Hard, NOW - 60 * DAY) },
  };

  it("splits a set's questions into recalled, at risk and not tried, and counts what's due", () => {
    expect(setStats(lib, "s1", NOW)).toEqual({ ready: 3, due: 1, recalled: 1, shaky: 1, untried: 1, lesson: null });
  });

  it("leaves dropped and still-checking questions out", () => {
    const s = set("s2", ["a", "b"]);
    const withDropped = { ...lib, sets: { s2: { ...s, items: [s.items[0], { ...s.items[1], status: "dropped" as const }] } } };
    expect(setStats(withDropped, "s2", NOW)).toMatchObject({ ready: 1, untried: 1 });
  });

  it("reports an unfinished lesson's current step, and nothing for a finished one", () => {
    const lesson: Lesson = { phase: "learn", steps: [step("Glycolysis", "done"), step("Krebs cycle", "todo"), step("ETC", "todo")], current: 1, createdAt: 0 };
    const withLesson = { ...lib, sets: { s1: { ...lib.sets.s1, lesson } } };
    expect(setStats(withLesson, "s1", NOW).lesson).toEqual({ done: 1, total: 3, step: 2, currentTitle: "Krebs cycle" });
    const finished = { ...lib, sets: { s1: { ...lib.sets.s1, lesson: { ...lesson, phase: "done" as const } } } };
    expect(setStats(finished, "s1", NOW).lesson).toBeNull();
  });

  it("returns zeros for a missing set", () => {
    expect(setStats(lib, "nope", NOW)).toEqual({ ready: 0, due: 0, recalled: 0, shaky: 0, untried: 0, lesson: null });
  });
});

describe("courseDue", () => {
  it("counts due questions across the class's sets only", () => {
    const old = review(newCard(NOW - 60 * DAY), Rating.Hard, NOW - 60 * DAY);
    const lib: Library = {
      ...emptyLibrary(),
      sets: { s1: set("s1", ["a", "b"], { courseId: "c1" }), s2: set("s2", ["c"], { courseId: "c2" }) },
      cards: { a: old, b: review(newCard(NOW), Rating.Easy, NOW), c: old },
    };
    expect(courseDue(lib, "c1", NOW)).toBe(1);
    expect(courseDue(lib, "c3", NOW)).toBe(0);
  });
});

describe("todayItems", () => {
  const lib: Library = { ...emptyLibrary(), sets: { s1: set("s1", Array.from({ length: 40 }, (_, n) => `q${n}`)) } };

  it("uses 10 new questions a day unless the student set another number", () => {
    expect(todayItems(lib, {}, NOW).fresh).toHaveLength(10);
    expect(todayItems(lib, { studyNewPerDay: 2 }, NOW).fresh).toHaveLength(2);
    expect(todayItems(lib, { studyNewPerDay: 50, studyCap: 5 }, NOW).fresh).toHaveLength(5);
  });
});

describe("suspended questions", () => {
  it("are left out of readyItems and dueItems", () => {
    const s = set("s1", ["kept", "reported"]);
    const old = review(newCard(NOW - 60 * DAY), Rating.Hard, NOW - 60 * DAY);
    const lib: Library = {
      ...emptyLibrary(),
      sets: { s1: { ...s, items: [s.items[0], { ...s.items[1], status: "suspended", report: { reason: "wrong-key", at: NOW } }] } },
      cards: { kept: old, reported: old },
    };
    expect(readyItems(lib).map((i) => i.id)).toEqual(["kept"]);
    expect(dueItems(lib, NOW).map((i) => i.id)).toEqual(["kept"]);
  });
});
