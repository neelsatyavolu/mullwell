import type { ExamItem } from "./exam";
import type { Confidence, RunResult, StudySet } from "./types";

// A practice test sitting: the draft kept while it's being taken, and what to
// go over once it's graded.

/** An unsubmitted practice test, kept so a refresh doesn't lose it. */
export type TestDraft = {
  itemIds: string[];
  /** Stored choice index (as a string) for multiple choice, else the typed answer. */
  answers: Record<string, string>;
  confidences: Record<string, Confidence>;
  started: number;
};

const CONFIDENCES = new Set<Confidence>(["guess", "unsure", "sure"]);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A draft read back from storage, or null when it isn't one. Entries for other questions or of the wrong type are dropped. */
export function parseDraft(raw: unknown): TestDraft | null {
  if (!isRecord(raw)) return null;
  const { itemIds, answers, confidences, started } = raw;
  if (!Array.isArray(itemIds) || !itemIds.length || !itemIds.every((id) => typeof id === "string")) return null;
  if (typeof started !== "number" || !Number.isFinite(started)) return null;
  const ids = new Set<string>(itemIds);
  const keep = <T>(from: unknown, ok: (v: unknown) => v is T): Record<string, T> =>
    isRecord(from) ? Object.fromEntries(Object.entries(from).filter(([k, v]) => ids.has(k) && ok(v))) as Record<string, T> : {};
  return {
    itemIds: [...itemIds],
    answers: keep(answers, (v): v is string => typeof v === "string"),
    confidences: keep(confidences, (v): v is Confidence => CONFIDENCES.has(v as Confidence)),
    started,
  };
}

/** The draft's questions in its order, or null when any of them is gone. */
export function draftItems(draft: TestDraft, items: ExamItem[]): ExamItem[] | null {
  const byId = new Map(items.map((i) => [i.id, i]));
  const found = draft.itemIds.map((id) => byId.get(id));
  return found.every((i): i is ExamItem => Boolean(i)) ? found : null;
}

export function answeredCount(itemIds: string[], answers: Record<string, string>): number {
  return itemIds.filter((id) => (answers[id] ?? "").trim()).length;
}

/** Elapsed time as mm:ss; minutes keep counting past an hour. */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export type MissGroup = { setId: string; title: string; count: number; concepts: string[] };

/** Misses (anything not right) by set, most missed first. Sets that no longer exist are left out, since there's nothing to link to. */
export function groupMissesBySet(results: RunResult[], sets: Record<string, Pick<StudySet, "id" | "title" | "items"> | undefined>): MissGroup[] {
  const groups = new Map<string, MissGroup>();
  for (const r of results) {
    const set = sets[r.setId];
    if (r.verdict === "right" || !set) continue;
    const item = set.items.find((i) => i.id === r.itemId);
    const concept = item ? item.concept || item.prompt.slice(0, 40) : null;
    const g = groups.get(set.id) ?? { setId: set.id, title: set.title, count: 0, concepts: [] };
    groups.set(set.id, { ...g, count: g.count + 1, concepts: concept && !g.concepts.includes(concept) ? [...g.concepts, concept] : g.concepts });
  }
  // Stable sort, so ties keep the order the sets first came up.
  return [...groups.values()].sort((a, b) => b.count - a.count);
}
