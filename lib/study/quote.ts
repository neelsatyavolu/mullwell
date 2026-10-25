import type { Section } from "./types";

// Checks that a quote the model gave really appears in the student's material.
// Matching ignores case, punctuation, quote styles and whitespace. A quote
// with a few small words changed still counts, but a changed content word
// ("monoxide" for "dioxide") never does: the quote becomes the answer key.

const CLOSE_ENOUGH = 0.8;
const GRAM = 3;
const FILLER = new Set(["a", "an", "the", "of", "to", "in", "on", "at", "by", "for", "and", "or", "is", "are", "was", "were", "be", "it", "its", "this", "that", "these", "those", "as", "with", "from", "which"]);

export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function grams(words: string[], n: number): string[] {
  if (words.length < n) return [words.join(" ")];
  return Array.from({ length: words.length - n + 1 }, (_, i) => words.slice(i, i + n).join(" "));
}

export type QuoteMatch = "exact" | "close" | null;

export function matchQuote(quote: string, text: string): QuoteMatch {
  const q = normalize(quote);
  const t = normalize(text);
  if (q.split(" ").length < 3) return null;
  if (` ${t} `.includes(` ${q} `)) return "exact";
  // Share of the quote's words that sit inside a word run also found in the text.
  const words = q.split(" ");
  const tGrams = new Set(grams(t.split(" "), GRAM));
  const covered = new Set<number>();
  grams(words, GRAM).forEach((g, i) => {
    if (tGrams.has(g)) for (let k = i; k < i + GRAM; k++) covered.add(k);
  });
  const uncovered = words.filter((_, i) => !covered.has(i));
  return covered.size / words.length >= CLOSE_ENOUGH && uncovered.every((w) => FILLER.has(w)) ? "close" : null;
}

/** The section the quote comes from: the cited one if it matches, else any that does. */
export function locateQuote(quote: string, cited: number, sections: Section[]): number | null {
  const first = sections.find((s) => s.id === cited);
  if (first && matchQuote(quote, first.text)) return first.id;
  return sections.find((s) => s.id !== cited && matchQuote(quote, s.text))?.id ?? null;
}
