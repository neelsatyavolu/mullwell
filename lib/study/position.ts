import { parseBeats } from "./beats";
import type { LessonStep } from "./types";

// Where the student was in a lesson, read back after a refresh. Positions are
// kept per tab (not on the set), so moving between beats never syncs.

/** One screen of a lesson step: the intro, a beat of an explanation round, or the checkpoint. */
export type LessonScreen = { kind: "intro" } | { kind: "beats"; round: number; index: number } | { kind: "check" };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/**
 * The saved screen for `step`, or null when there's none that fits. A beat
 * past the end is pulled back to the last one; the round still being written
 * opens at its start. A checkpoint that was already answered isn't asked
 * again: a finished step opens at its intro, and a just-missed one at its
 * re-explanation.
 */
export function restoreScreen(raw: unknown, step: Pick<LessonStep, "id" | "explanations" | "status" | "tries">): LessonScreen | null {
  if (!isRecord(raw) || raw.stepId !== step.id || !isRecord(raw.screen)) return null;
  const s = raw.screen;
  if (s.kind === "intro") return { kind: "intro" };
  if (s.kind === "check") {
    if (step.status !== "todo") return null;
    // As in needsReteach: missed, and its re-explanation not written yet.
    const reteach = step.tries > 0 && step.explanations.length <= step.tries;
    return reteach ? { kind: "beats", round: step.tries, index: 0 } : { kind: "check" };
  }
  if (s.kind !== "beats" || !isCount(s.round) || !isCount(s.index)) return null;
  if (s.round > step.explanations.length) return null;
  if (s.round === step.explanations.length) return { kind: "beats", round: s.round, index: 0 };
  const last = Math.max(0, parseBeats(step.explanations[s.round], true).length - 1);
  return { kind: "beats", round: s.round, index: Math.min(s.index, last) };
}

/** The saved question index of the gauge, or null when it doesn't fit `total` questions. */
export function restoreGaugeIndex(raw: unknown, total: number): number | null {
  return isRecord(raw) && isCount(raw.index) && raw.index < total ? raw.index : null;
}

/** The gauge question to come back to: past this one once it's answered, so a refresh doesn't log it twice. */
export function gaugeSaveIndex(index: number, answered: boolean, total: number): number {
  return answered ? Math.min(index + 1, total - 1) : index;
}
