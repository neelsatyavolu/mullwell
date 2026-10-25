import type { Item } from "./types";

// Deterministic shuffles: stable for one sitting, different the next time.

/** Shuffles a copy of `list` with a small LCG, so the same seed always gives the same order. */
export function seededShuffle<T>(list: T[], seed: number): T[] {
  let s = seed || 1;
  const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  return list
    .map((v) => ({ v, k: rand() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.v);
}

/** A seed for showing question `itemId` for the `n`th time: an FNV-1a hash of both. */
export function seedFor(itemId: string, n: number): number {
  let h = 2166136261;
  for (const ch of `${itemId}:${n}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  // Mix the bits (murmur3's finaliser): FNV seeds for n and n+1 sit close
  // together, and the LCG's first draws would then give the same order.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * The order to show a question's choices in: `order[displayPosition]` is the
 * stored choice index. Empty for questions without choices.
 */
export function choiceOrder(item: Item, seed: number): number[] {
  return seededShuffle(item.choices?.map((_, i) => i) ?? [], seed);
}
