import { recallAt, type StoredCard } from "./schedule";
import { seededShuffle as shuffle } from "./shuffle";
import type { Attempt, Item, Verdict } from "./types";

// Test prep: what to review before a test date, how ready the student is, and
// which questions make up a practice test.

const SAFE_RECALL = 0.9;

export type ExamItem = Item & { setId: string };

/** 9am local time on the test day (YYYY-MM-DD), when a morning test would start. */
export function examTime(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 9, 0, 0).getTime();
}

export function daysUntil(date: string, now = Date.now()): number {
  const today = new Date(now);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((examTime(date) - start) / 86_400_000 - 9 / 24);
}

export function lastVerdicts(attempts: Attempt[]): Map<string, Verdict> {
  const latest = new Map<string, Attempt>();
  for (const a of attempts) if ((latest.get(a.itemId)?.at ?? -1) < a.at) latest.set(a.itemId, a);
  return new Map([...latest].map(([id, a]) => [id, a.verdict]));
}

export type Readiness = { total: number; recalled: number; shaky: number; untried: number };

/**
 * How the student would do on test day: a question counts as
 * recalled when its card is likely still remembered at `testAt`, shaky when
 * studied but likely forgotten, untried when never studied.
 */
export function readinessAt(items: ExamItem[], cards: Map<string, StoredCard>, testAt: number): Readiness {
  return items.reduce<Readiness>(
    (r, i) => {
      const card = cards.get(i.id);
      if (!card) return { ...r, untried: r.untried + 1 };
      return recallAt(card, testAt) >= SAFE_RECALL ? { ...r, recalled: r.recalled + 1 } : { ...r, shaky: r.shaky + 1 };
    },
    { total: items.length, recalled: 0, shaky: 0, untried: 0 },
  );
}

/**
 * What to study before the test, most at-risk first: questions the student is
 * likely to have forgotten by test day (never-studied ones count as forgotten).
 */
export function reviewPlan(items: ExamItem[], cards: Map<string, StoredCard>, testAt: number): ExamItem[] {
  return items
    .map((item) => ({ item, recall: recallAt(cards.get(item.id), testAt) }))
    .filter((x) => x.recall < SAFE_RECALL)
    .sort((a, b) => a.recall - b.recall)
    .map((x) => x.item);
}

/** Splits a plan into roughly equal daily chunks between now and the test. */
export function perDay(planned: number, days: number): number {
  return Math.ceil(planned / Math.max(1, days));
}

/**
 * A practice test: about half the questions the student has missed or not
 * tried, the rest from what they know, interleaved across sets.
 */
export function pickPracticeTest(items: ExamItem[], attempts: Attempt[], size: number, seed: number): ExamItem[] {
  const last = lastVerdicts(attempts);
  const weak = shuffle(items.filter((i) => last.get(i.id) !== "right"), seed);
  const strong = shuffle(items.filter((i) => last.get(i.id) === "right"), seed + 1);
  const weakCount = Math.min(weak.length, Math.max(Math.ceil(size / 2), size - strong.length));
  const picked = [...weak.slice(0, weakCount), ...strong.slice(0, size - weakCount)];
  return interleaveBySet(shuffle(picked, seed + 2));
}

/** Never two from the same set in a row when it can be avoided: sets take turns, each keeping its order. */
export function interleaveBySet<T extends { setId: string }>(items: T[]): T[] {
  const bySet = new Map<string, T[]>();
  for (const i of items) bySet.set(i.setId, [...(bySet.get(i.setId) ?? []), i]);
  const queues = [...bySet.values()];
  const longest = Math.max(0, ...queues.map((q) => q.length));
  return Array.from({ length: longest }, (_, n) => queues.flatMap((q) => (n < q.length ? [q[n]] : []))).flat();
}

/** Concepts missed in a run, most frequent first. */
export function missedConcepts(results: { item: Item; verdict: Verdict }[]): string[] {
  const counts = new Map<string, number>();
  for (const r of results) if (r.verdict !== "right") counts.set(r.item.concept || r.item.prompt.slice(0, 40), (counts.get(r.item.concept || r.item.prompt.slice(0, 40)) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}
