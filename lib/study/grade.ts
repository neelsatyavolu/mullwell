import { normalize } from "./quote";
import type { Item, Verdict } from "./types";

// Grading that needs no model call: multiple choice, and fill-in-the-blank
// answers that match the key (allowing a small typo). Everything else returns
// null and goes to the model grader.

/** Levenshtein distance, bounded for short strings. */
export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

export function gradeLocally(item: Item, response: string | number): Verdict | null {
  if (item.kind === "mcq") return Number(response) === item.correct ? "right" : "wrong";
  if (item.kind !== "cloze") return null;
  const said = normalize(String(response));
  const key = normalize(item.answer);
  if (!said) return "wrong";
  // Numbers and formulas lose meaning when normalised ("-5" vs "5"): only an exact match counts here.
  if (/\d/.test(item.answer)) {
    const exact = (s: string) => s.toLowerCase().replace(/\s+/g, "");
    return exact(String(response)) === exact(item.answer) ? "right" : null;
  }
  if (said === key) return "right";
  const allowed = key.length >= 8 ? 2 : key.length >= 5 ? 1 : 0;
  if (editDistance(said, key) <= allowed) return "right";
  // Different wording may still be right ("ATP synthase" vs "the ATP synthase enzyme").
  return null;
}
