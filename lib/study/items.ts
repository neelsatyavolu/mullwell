import { z } from "zod";
import { locateQuote } from "./quote";
import type { Item, Section } from "./types";

// Turns the model's raw question objects into Items, keeping only questions
// whose supporting quote really is in the material, then applies the answer
// check's verdicts.

const raw = z.object({
  kind: z.enum(["mcq", "short", "cloze"]),
  prompt: z.string().trim().min(5).max(1000),
  choices: z.array(z.string().trim().min(1).max(400)).optional(),
  correct: z.coerce.number().int().optional(),
  answer: z.string().trim().max(1000).default(""),
  quote: z.string().trim().min(10).max(2000),
  section: z.coerce.number().int(),
  explain: z.string().trim().max(1500).default(""),
  concept: z.string().trim().max(80).default(""),
});

export function toItem(value: unknown, sections: Section[], id: string): Item | null {
  const parsed = raw.safeParse(value);
  if (!parsed.success) return null;
  const q = parsed.data;
  const section = locateQuote(q.quote, q.section, sections);
  if (section === null) return null;
  const base = { id, kind: q.kind, prompt: q.prompt, quote: q.quote, section, explain: q.explain, concept: q.concept, status: "checking" as const };
  if (q.kind === "mcq") {
    const choices = q.choices ?? [];
    const unique = new Set(choices.map((c) => c.toLowerCase())).size === choices.length;
    if (choices.length < 3 || choices.length > 6 || !unique) return null;
    if (q.correct === undefined || q.correct < 0 || q.correct >= choices.length) return null;
    return { ...base, choices, correct: q.correct, answer: choices[q.correct] };
  }
  if (!q.answer) return null;
  if (q.kind === "cloze" && !/_{3,}/.test(q.prompt)) return null;
  return { ...base, answer: q.answer };
}

const check = z.object({
  id: z.string(),
  answer: z.union([z.string(), z.number()]).optional(),
  supported: z.boolean(),
  ambiguous: z.boolean().default(false),
});

/** Whether a question passed the independent answer check. */
export function passesCheck(item: Item, value: unknown): boolean {
  const parsed = check.safeParse(value);
  if (!parsed.success || parsed.data.id !== item.id) return false;
  const { supported, ambiguous, answer } = parsed.data;
  if (!supported || ambiguous) return false;
  if (item.kind === "mcq") {
    const token = String(answer ?? "").trim();
    return /^\d+$/.test(token) && Number(token) === item.correct;
  }
  return true;
}

/** Drops near-duplicate prompts (same words after normalising). */
export function isDuplicate(prompt: string, existing: Item[]): boolean {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return existing.some((i) => key(i.prompt) === key(prompt));
}
