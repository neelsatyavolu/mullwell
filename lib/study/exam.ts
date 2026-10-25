import { recallAt, type StoredCard } from "./schedule";
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

/** Counts from the student's last try at each question; no invented scores. */
export function readiness(items: ExamItem[], attempts: Attempt[]): Readiness {
  const last = lastVerdicts(attempts);
  return items.reduce<Readiness>(
    (r, i) => {
      const v = last.get(i.id);
      if (!v) return { ...r, untried: r.untried + 1 };
      return v === "right" ? { ...r, recalled: r.recalled + 1 } : { ...r, shaky: r.shaky + 1 };
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

/** Deterministic shuffle so a practice test is stable for one sitting. */
function shuffle<T>(list: T[], seed: number): T[] {
  let s = seed || 1;
  const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  return list
    .map((v) => ({ v, k: rand() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.v);
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
  // Interleave: never two from the same set in a row when it can be avoided.
  const bySet = new Map<string, ExamItem[]>();
  for (const i of shuffle(picked, seed + 2)) bySet.set(i.setId, [...(bySet.get(i.setId) ?? []), i]);
  const queues = [...bySet.values()];
  const out: ExamItem[] = [];
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) out.push(q.shift()!);
  return out;
}

/** Concepts missed in a run, most frequent first. */
export function missedConcepts(results: { item: Item; verdict: Verdict }[]): string[] {
  const counts = new Map<string, number>();
  for (const r of results) if (r.verdict !== "right") counts.set(r.item.concept || r.item.prompt.slice(0, 40), (counts.get(r.item.concept || r.item.prompt.slice(0, 40)) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}
