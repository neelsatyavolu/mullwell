"use client";
import type { Library } from "./db";
import type { ExamItem } from "@/lib/study/exam";
import { isDue } from "@/lib/study/schedule";

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

export function attemptsList(lib: Library) {
  return Object.values(lib.attempts);
}
