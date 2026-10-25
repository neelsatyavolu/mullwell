import { z } from "zod";
import { toItem } from "./items";
import type { Confidence, Familiarity, Item, Lesson, LessonStep, Section, Verdict } from "./types";

// The guided lesson: a plan of steps from the outline task, a gauge question
// per step to find what the student already knows, then teaching with
// checkpoints until each step is down.

/** Checkpoint misses before a step is marked for review and the lesson moves on. */
export const MAX_TRIES = 2;

const rawStep = z.object({
  title: z.string().trim().min(1).max(120),
  goal: z.string().trim().max(300).default(""),
  sections: z.array(z.coerce.number().int()).default([]),
  probe: z.unknown().optional(),
});

/**
 * Builds lesson steps from the outline's objects. Unknown section ids are
 * dropped, a step with none left is skipped, and any section no step covers
 * joins the step nearest to it, so the lesson teaches all the material.
 */
export function buildSteps(raws: unknown[], sections: Section[], newId: (prefix: string) => string): { steps: LessonStep[]; probes: Item[] } {
  const ids = new Set(sections.map((s) => s.id));
  const probes: Item[] = [];
  const steps = raws.flatMap((raw): LessonStep[] => {
    const parsed = rawStep.safeParse(raw);
    if (!parsed.success) return [];
    const stepSections = [...new Set(parsed.data.sections.filter((id) => ids.has(id)))].sort((a, b) => a - b);
    if (!stepSections.length) return [];
    const probe = parsed.data.probe ? toItem(parsed.data.probe, sections.filter((s) => stepSections.includes(s.id)), newId("q")) : null;
    if (probe) probes.push(probe);
    return [{
      id: newId("step"),
      title: parsed.data.title,
      goal: parsed.data.goal,
      sections: stepSections,
      probeId: probe?.id ?? null,
      familiarity: null,
      explanations: [],
      checkpointIds: [],
      tries: 0,
      status: "todo",
    }];
  });
  if (!steps.length) return { steps, probes };
  const covered = new Set(steps.flatMap((s) => s.sections));
  const missing = sections.map((s) => s.id).filter((id) => !covered.has(id));
  const filled = steps.map((s) => ({ ...s, sections: [...s.sections] }));
  for (const id of missing) {
    const nearest = filled.reduce((best, s) => (distance(s, id) < distance(best, id) ? s : best));
    nearest.sections = [...nearest.sections, id].sort((a, b) => a - b);
  }
  return { steps: filled, probes };
}

const distance = (step: LessonStep, id: number) => Math.min(...step.sections.map((s) => Math.abs(s - id)));

/** The clean set title the outline suggests (its {"setTitle"} line), or null. */
export function pickSetTitle(raws: unknown[]): string | null {
  for (const raw of raws) {
    const value = raw && typeof raw === "object" ? (raw as { setTitle?: unknown }).setTitle : undefined;
    if (typeof value !== "string") continue;
    const title = value.replace(/^["'“”\s]+|["'“”\s.]+$/g, "").replace(/\s+/g, " ").trim();
    if (title.length >= 2 && title.length <= 80) return title;
  }
  return null;
}

/** What a gauge answer says about prior knowledge. "unknown" is "I don't know yet". */
export function familiarityFrom(verdict: Verdict | "unknown", confidence: Confidence): Familiarity {
  if (verdict === "unknown" || verdict === "wrong") return "new";
  if (verdict === "partly" || confidence === "guess") return "shaky";
  return "known";
}

/** The step after a checkpoint: done when right, else another try, or marked for review after MAX_TRIES misses. */
export function afterCheckpoint(step: LessonStep, verdict: Verdict): LessonStep {
  if (verdict === "right") return { ...step, tries: step.tries + 1, status: "done" };
  const tries = step.tries + 1;
  return { ...step, tries, status: tries >= MAX_TRIES ? "review" : "todo" };
}

/** Whether the step needs a fresh explanation before its next checkpoint (it was just missed). */
export const needsReteach = (step: LessonStep) => step.status === "todo" && step.tries > 0 && step.explanations.length <= step.tries;

/** The lesson moved to its next unfinished step, or finished. */
export function advance(lesson: Lesson): Lesson {
  const next = lesson.steps.findIndex((s, i) => i > lesson.current && s.status === "todo");
  const anyLeft = lesson.steps.findIndex((s) => s.status === "todo");
  if (next !== -1) return { ...lesson, current: next };
  if (anyLeft !== -1) return { ...lesson, current: anyLeft };
  return { ...lesson, phase: "done" };
}

export function progress(lesson: Lesson): { done: number; review: number; total: number } {
  return {
    done: lesson.steps.filter((s) => s.status === "done").length,
    review: lesson.steps.filter((s) => s.status === "review").length,
    total: lesson.steps.length,
  };
}
