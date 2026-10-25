import type { Attempt, AttemptMode, Confidence, Item } from "./types";

// Calibration: how often each level of confidence turns out right, and the
// questions the student was sure about and got wrong.

export type Calibration = Record<Confidence, { n: number; right: number }>;

type Judged = Pick<Attempt, "verdict" | "confidence" | "mode" | "source" | "response">;

// Review is a self-rating, a pretest is before teaching, and an explain-back
// has no fresh confidence.
const UNJUDGED = new Set<AttemptMode>(["review", "gauge", "explain"]);

/** A practice test's "unsure" is only the default (older tests always logged it), so only Sure and Guessing there count. */
const judged = (a: Judged) => !(a.mode && UNJUDGED.has(a.mode)) && !(a.mode === "test" && a.confidence === "unsure");

/** "I don't know" is logged as a self-marked guess with no answer. */
const saidDontKnow = (a: Judged) => a.source === "self" && !a.response;

export function calibration(attempts: Judged[]): Calibration {
  const out: Calibration = { sure: { n: 0, right: 0 }, unsure: { n: 0, right: 0 }, guess: { n: 0, right: 0 } };
  return attempts
    .filter((a) => a.confidence in out && judged(a) && !saidDontKnow(a))
    .reduce<Calibration>((c, a) => ({ ...c, [a.confidence]: { n: c[a.confidence].n + 1, right: c[a.confidence].right + (a.verdict === "right" ? 1 : 0) } }), out);
}

/**
 * One plain sentence for the end of a round, or null with too little to say.
 * Unsure is left out: multiple choice answered without picking counts as Unsure.
 */
export function calibrationLine(c: Calibration): string | null {
  const parts: string[] = [];
  if (c.sure.n >= 2) parts.push(`When you were Sure you were right ${c.sure.right} of ${c.sure.n} times`);
  if (c.guess.n >= 2) parts.push(parts.length ? `when Guessing, ${c.guess.right} of ${c.guess.n}` : `When Guessing you were right ${c.guess.right} of ${c.guess.n} times`);
  return parts.length ? `${parts.join("; ")}.` : null;
}

/**
 * Questions whose latest answer was wrong while the student was sure, most
 * recent first. A pretest miss doesn't count: there Sure is only the default.
 */
export function confidentMisses<T extends Pick<Item, "id">>(attempts: Attempt[], items: T[]): T[] {
  const latest = new Map<string, Attempt>();
  for (const a of attempts) if (a.mode !== "explain" && (latest.get(a.itemId)?.at ?? -1) < a.at) latest.set(a.itemId, a);
  return items
    .map((item) => ({ item, a: latest.get(item.id) }))
    .filter((x): x is { item: T; a: Attempt } => x.a?.verdict === "wrong" && x.a.confidence === "sure" && x.a.mode !== "gauge")
    .sort((x, y) => y.a.at - x.a.at)
    .map((x) => x.item);
}
