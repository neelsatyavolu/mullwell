import { lastVerdicts } from "./exam";
import { isDue, recallAt, type StoredCard } from "./schedule";
import type { Attempt, Item } from "./types";

// The order of a practice session: what the student needs most comes first,
// and a missed question comes back a few cards later (successive relearning).

/**
 * Practice order: never-tried questions (as written), then ones last missed,
 * then due ones, then the rest, each most-likely-forgotten first. Questions
 * still being checked go last; dropped ones are left out.
 */
export function orderForPractice<T extends Item>(items: T[], cards: Record<string, StoredCard>, attempts: Attempt[], now: number): T[] {
  const last = lastVerdicts(attempts);
  const rank = (item: T): number => {
    const card = cards[item.id];
    const verdict = last.get(item.id);
    if (!verdict && !card) return 0;
    if (verdict && verdict !== "right") return 1;
    return card && isDue(card, now) ? 2 : 3;
  };
  const ranked = items
    .filter((i) => i.status === "ok")
    .map((item, pos) => ({ item, pos, rank: rank(item), recall: recallAt(cards[item.id], now) }))
    .sort((a, b) => a.rank - b.rank || (a.rank === 0 ? 0 : a.recall - b.recall) || a.pos - b.pos);
  return [...ranked.map((r) => r.item), ...items.filter((i) => i.status === "checking")];
}

/** `queue` with `id` moved so `gap` other questions come before it (last when fewer are left). */
export function requeue(queue: string[], id: string, gap = 3): string[] {
  const rest = queue.filter((x) => x !== id);
  const at = Math.min(gap, rest.length);
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}
