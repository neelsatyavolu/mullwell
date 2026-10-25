"use client";
import type { Library } from "./db";
import { STUDY_DEFAULTS, type Prefs } from "./ai";
import { readinessAt, type ExamItem } from "@/lib/study/exam";
import { progress } from "@/lib/study/lesson";
import { isDue } from "@/lib/study/schedule";
import { todayQueue, type TodayQueue } from "@/lib/study/today";

// Views over the library that several pages need.

/** Checked questions from the given sets (all sets when omitted). */
export function readyItems(lib: Library, setIds?: string[]): ExamItem[] {
  const sets = setIds ? setIds.map((id) => lib.sets[id]).filter(Boolean) : Object.values(lib.sets);
  return sets.flatMap((s) => s.items.filter((i) => i.status === "ok").map((i) => ({ ...i, setId: s.id })));
}

/** Questions the student has studied that are due for review now. */
export function dueItems(lib: Library, now = Date.now()): ExamItem[] {
  return readyItems(lib)
    .filter((i) => lib.cards[i.id] && isDue(lib.cards[i.id], now))
    .sort((a, b) => lib.cards[a.id].due - lib.cards[b.id].due);
}

/** Today's session across every class: due reviews, a few new questions and each upcoming test's share. */
export function todayItems(lib: Library, prefs: Pick<Prefs, "studyNewPerDay" | "studyCap">, now = Date.now()): TodayQueue {
  return todayQueue({
    items: readyItems(lib),
    cards: lib.cards,
    attempts: Object.values(lib.attempts),
    exams: Object.values(lib.exams),
    now,
    newPerDay: prefs.studyNewPerDay ?? STUDY_DEFAULTS.newPerDay,
    cap: prefs.studyCap ?? STUDY_DEFAULTS.cap,
  });
}

/** Questions in the class's sets that are due for review now. */
export function courseDue(lib: Library, courseId: string, now = Date.now()): number {
  const setIds = Object.values(lib.sets).filter((s) => s.courseId === courseId).map((s) => s.id);
  return readyItems(lib, setIds).filter((i) => lib.cards[i.id] && isDue(lib.cards[i.id], now)).length;
}

export type SetStats = {
  ready: number;
  due: number;
  recalled: number;
  shaky: number;
  untried: number;
  /** The lesson in progress (null when there is none or it's finished). `step` counts from 1. */
  lesson: { done: number; total: number; step: number; currentTitle: string } | null;
};

/** How much of a set the student knows right now, what's due, and where its lesson stands. */
export function setStats(lib: Library, setId: string, now = Date.now()): SetStats {
  const set = lib.sets[setId];
  const items = set ? readyItems(lib, [setId]) : [];
  const r = readinessAt(items, new Map(Object.entries(lib.cards)), now);
  const lesson = set?.lesson && set.lesson.phase !== "done" && set.lesson.steps.length ? set.lesson : null;
  const p = lesson ? progress(lesson) : null;
  return {
    ready: r.total,
    due: items.filter((i) => lib.cards[i.id] && isDue(lib.cards[i.id], now)).length,
    recalled: r.recalled,
    shaky: r.shaky,
    untried: r.untried,
    lesson: lesson && p ? { done: p.done, total: p.total, step: Math.min(lesson.current + 1, p.total), currentTitle: lesson.steps[lesson.current]?.title ?? "" } : null,
  };
}

export function attemptsList(lib: Library) {
  return Object.values(lib.attempts);
}

/** How many times each question has been answered, by question id. */
export function attemptCounts(lib: Library): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of Object.values(lib.attempts)) counts.set(a.itemId, (counts.get(a.itemId) ?? 0) + 1);
  return counts;
}
