import type { Confidence, ItemKind } from "./types";

// Keyboard flow for a question card: what one key press should do, given where
// focus is and what stage the question is at. Kept pure so it can be tested.

export type CardPhase = "answering" | "grading" | "graded" | "self";

/**
 * Where the key was pressed: a one-line input, a textarea, a button that
 * Enter should activate itself, or anywhere else (including a selected
 * choice or confidence pill).
 */
export type KeyTarget = "input" | "textarea" | "button" | "page";

export type KeyPress = { key: string; target: KeyTarget; /** Cmd, Ctrl or Alt held. */ mod: boolean };
export type KeyContext = { kind: ItemKind; phase: CardPhase; /** Number of choices shown. */ choices: number; canCheck: boolean };

export type KeyAction =
  | { type: "choose"; /** Display position, not the stored choice index. */ index: number }
  | { type: "confidence"; confidence: Confidence }
  | { type: "check" }
  | { type: "next" };

const LETTERS = "ABCDEF";
const CONFIDENCE_KEYS: Record<string, Confidence> = { g: "guess", u: "unsure", s: "sure" };

export function keyToAction({ key, target, mod }: KeyPress, ctx: KeyContext): KeyAction | null {
  if (key === "Enter") {
    if (ctx.phase !== "answering" || !ctx.canCheck) return null;
    if (target === "textarea") return mod ? { type: "check" } : null;
    return target === "button" ? null : { type: "check" };
  }
  if (mod || target === "input" || target === "textarea") return null;
  const lower = key.toLowerCase();
  if (ctx.phase === "graded") return lower === "n" ? { type: "next" } : null;
  if (ctx.phase !== "answering") return null;
  if (CONFIDENCE_KEYS[lower]) return { type: "confidence", confidence: CONFIDENCE_KEYS[lower] };
  if (ctx.kind !== "mcq" || key.length !== 1) return null;
  const index = /^[1-6]$/.test(key) ? Number(key) - 1 : LETTERS.indexOf(key.toUpperCase());
  return index >= 0 && index < ctx.choices ? { type: "choose", index } : null;
}
