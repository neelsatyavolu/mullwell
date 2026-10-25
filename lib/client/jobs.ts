"use client";
import { useSyncExternalStore } from "react";
import { runObjects, runTask, AiError } from "./ai";
import { getLibrary, updateSet } from "./store";
import { batches, guessTitle, toSections } from "@/lib/study/chunk";
import { newId } from "@/lib/study/ids";
import { isDuplicate, passesCheck, toItem } from "@/lib/study/items";
import { buildSteps, pickSetTitle } from "@/lib/study/lesson";
import type { Familiarity, Item, LessonStep, Section, StudySet } from "@/lib/study/types";

// Background generation for a set. Jobs keep running when the student switches
// tabs; pages watch their state with useJob().

/** "prepare" turns a topic or photos into material before questions can be written. */
export type JobKind = "questions" | "notes" | "prepare" | "podcast" | "map" | "lesson" | `teach:${string}` | `check:${string}`;
export type JobState = { running: boolean; error: string | null; needsConnect: boolean; status: string | null };

const IDLE: JobState = { running: false, error: null, needsConnect: false, status: null };
const BATCH_QUESTIONS = 6;
const VERIFY_GROUP = 2;
const MAX_CONTEXT_CHARS = 110_000;
const SAVE_EVERY_MS = 250;

const states = new Map<string, JobState>();
const listeners = new Set<() => void>();
const key = (setId: string, kind: JobKind) => `${setId}:${kind}`;

function setState(k: string, state: JobState) {
  states.set(k, state);
  for (const l of listeners) l();
}

export function useJob(setId: string, kind: JobKind): JobState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => states.get(key(setId, kind)) ?? IDLE,
    () => IDLE,
  );
}

async function track(setId: string, kind: JobKind, work: (status: (s: string) => void) => Promise<void>) {
  const k = key(setId, kind);
  if (states.get(k)?.running) return;
  setState(k, { ...IDLE, running: true });
  try {
    await work((status) => setState(k, { ...IDLE, running: true, status }));
    setState(k, IDLE);
  } catch (err) {
    const needsConnect = err instanceof AiError && err.needsConnect;
    setState(k, { ...IDLE, error: err instanceof Error ? err.message : "Something went wrong.", needsConnect });
  }
}

/** The sections a whole-material task sees, capped to what fits in one request. */
export function contextSections(sections: Section[]): Section[] {
  let total = 0;
  return sections.filter((s) => (total += s.text.length) <= MAX_CONTEXT_CHARS);
}

/** Calls fn at most every `ms`, always running the last call. */
function throttle(fn: () => void, ms: number) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    call() {
      const wait = last + ms - Date.now();
      clearTimeout(timer);
      if (wait <= 0) {
        last = Date.now();
        fn();
      } else timer = setTimeout(() => ((last = Date.now()), fn()), wait);
    },
    flush() {
      clearTimeout(timer);
      fn();
    },
  };
}

const VERIFY_TRIES = 2;

/**
 * Runs the independent answer check. A question the checker rejects is
 * dropped. If the check can't run at all (network, rate limit), unresolved
 * questions are kept but flagged as unchecked so the student knows.
 */
async function verifyItems(setId: string, group: Item[], sections: Section[]) {
  const cited = sections.filter((s) => group.some((i) => i.section === s.id));
  const verdicts = new Map<string, boolean>();
  const payload = { sections: cited, items: group.map(({ id, kind, prompt, choices, answer, quote, section }) => ({ id, kind, prompt, choices, answer, quote, section })) };
  let ran = false;
  for (let attempt = 0; attempt < VERIFY_TRIES && !ran; attempt++) {
    try {
      await runObjects("verify", payload, (v) => {
        const item = group.find((i) => i.id === v.id);
        if (item && !verdicts.has(item.id)) verdicts.set(item.id, passesCheck(item, v));
      });
      ran = true;
    } catch (err) {
      console.warn("[jobs] answer check failed", err instanceof Error ? err.message : err);
    }
  }
  const ids = new Set(group.map((g) => g.id));
  updateSet(setId, (s) => ({
    ...s,
    items: s.items.map((i): Item => {
      if (!ids.has(i.id)) return i;
      const verdict = verdicts.get(i.id);
      if (verdict === true) return { ...i, status: "ok" };
      if (verdict === false) return { ...i, status: "dropped" };
      return { ...i, status: "ok", unchecked: true };
    }),
  }));
}

/** Writes the next batch of questions for a set, showing each as soon as it's written and checking answer keys in small groups. */
export function generateQuestions(setId: string, level: "intro" | "exam" = "exam") {
  return track(setId, "questions", async () => {
    const set = getLibrary().sets[setId];
    if (!set || !set.sections.length) return;
    const all = batches(set.sections);
    const index = set.nextBatch % all.length;
    const batch = all[index];
    const avoid = set.items.map((i) => i.prompt.slice(0, 300)).slice(-60);
    const sectionCount = set.sections.length;
    const checks: Promise<void>[] = [];
    let pending: Item[] = [];
    const flush = () => {
      if (pending.length) checks.push(verifyItems(setId, pending, set.sections));
      pending = [];
    };
    await runObjects("questions", { sections: batch, count: BATCH_QUESTIONS, avoid, level }, (raw) => {
      const latest = getLibrary().sets[setId];
      const item = toItem(raw, batch, newId("q"));
      if (!latest || !item || isDuplicate(item.prompt, latest.items)) return;
      updateSet(setId, (s) => ({ ...s, items: [...s.items, item] }));
      pending = [...pending, item];
      // Check the first question alone so it can be answered sooner.
      if (pending.length >= (latest.items.length === 0 ? 1 : VERIFY_GROUP)) flush();
    });
    flush();
    // If material was added meanwhile, appendText already pointed nextBatch at it.
    updateSet(setId, (s) => (s.sections.length === sectionCount ? { ...s, nextBatch: index + 1 } : s));
    await Promise.all(checks);
  }).then(() => {
    // A call that returned early (job already running) must not consume the rerun.
    if (!states.get(key(setId, "questions"))?.running && rerun.delete(setId)) void generateQuestions(setId, level);
  });
}

const rerun = new Set<string>();

/** Writes questions now, or right after the batch already being written. */
export function generateQuestionsSoon(setId: string) {
  if (states.get(key(setId, "questions"))?.running) rerun.add(setId);
  else void generateQuestions(setId);
}

/** Re-runs the answer check for questions left unchecked (the tab closed mid-check). */
export function recheck(setId: string) {
  return track(setId, "questions", async () => {
    const set = getLibrary().sets[setId];
    const stuck = set?.items.filter((i) => i.status === "checking") ?? [];
    for (let i = 0; i < stuck.length; i += 6) await verifyItems(setId, stuck.slice(i, i + 6), set!.sections);
  });
}

export function generateNotes(setId: string) {
  return track(setId, "notes", async () => {
    const set = getLibrary().sets[setId];
    if (!set) return;
    let text = "";
    const save = throttle(() => updateSet(setId, (s) => ({ ...s, notes: text })), SAVE_EVERY_MS);
    await runTask("notes", { sections: contextSections(set.sections) }, { onText: (_, all) => ((text = all), save.call()) });
    save.flush();
  });
}

/** For a topic-only set: research a primer on the web, then treat it as the set's material. */
export function generatePrimer(setId: string, topic: string, level: "intro" | "exam") {
  return track(setId, "prepare", async (status) => {
    let text = "";
    const save = throttle(() => updateSet(setId, (s) => ({ ...s, notes: text })), SAVE_EVERY_MS);
    const result = await runTask("primer", { topic, level }, { onText: (_, all) => ((text = all), save.call()), onStatus: status });
    save.flush();
    const sections = toSections(result.text);
    if (!sections.length) throw new AiError("The primer came back empty. Try again.");
    const heading = /^#\s+(.+)$/m.exec(result.text)?.[1]?.trim();
    updateSet(setId, (s: StudySet) => ({ ...s, title: heading?.slice(0, 80) || s.title, sections, sources: result.sources, notes: result.text }));
    void generateLesson(setId);
  });
}

/** For photos of notes: transcribe them, streaming the text so the student sees progress, then plan the lesson. */
export function transcribePhotos(setId: string, images: string[]) {
  return track(setId, "prepare", async () => {
    const save = (text: string) => updateSet(setId, (s) => ({ ...s, notes: text }));
    const { text } = await runTask("transcribe", { images }, { onText: (_, all) => save(all) });
    const sections = toSections(text);
    if (!sections.length) throw new AiError("Couldn't read any text in those photos.");
    updateSet(setId, (s) => ({ ...s, sections, notes: null, title: s.title === "Untitled set" ? guessTitle(text) : s.title }));
    void generateLesson(setId);
  });
}

export function generatePodcast(setId: string) {
  return track(setId, "podcast", async () => {
    const set = getLibrary().sets[setId];
    if (!set) return;
    const lines: { host: "A" | "B"; line: string }[] = [];
    await runObjects("podcast", { sections: contextSections(set.sections) }, (v) => {
      if ((v.host === "A" || v.host === "B") && typeof v.line === "string" && v.line.trim()) {
        lines.push({ host: v.host, line: v.line.trim().slice(0, 600) });
        updateSet(setId, (s) => ({ ...s, podcast: [...lines] }));
      }
    });
    if (!lines.length) throw new AiError("The audio recap came back empty. Try again.");
  });
}

export function generateMap(setId: string) {
  return track(setId, "map", async () => {
    const set = getLibrary().sets[setId];
    if (!set) return;
    const { text } = await runTask("map", { sections: contextSections(set.sections) });
    const code = text.replace(/^```(?:mermaid)?\s*|```\s*$/g, "").trim();
    if (!/^(flowchart|graph)\s/i.test(code)) throw new AiError("The concept map didn't come out right. Try again.");
    updateSet(setId, (s) => ({ ...s, map: code }));
  });
}

// ---- Guided lesson ----

const CHECKPOINTS_PER_STEP = 2;
const VERIFY_MAX = 6;

function updateStep(setId: string, stepId: string, change: (step: LessonStep) => LessonStep) {
  updateSet(setId, (s) => (s.lesson ? { ...s, lesson: { ...s.lesson, steps: s.lesson.steps.map((st) => (st.id === stepId ? change(st) : st)) } } : s));
}

function stepOf(setId: string, stepId: string): { set: StudySet; step: LessonStep; sections: Section[] } | null {
  const set = getLibrary().sets[setId];
  const step = set?.lesson?.steps.find((st) => st.id === stepId);
  if (!set || !step) return null;
  return { set, step, sections: set.sections.filter((sec) => step.sections.includes(sec.id)) };
}

/**
 * Plans the lesson: steps in learning order, each with a gauge question,
 * then checks the gauge questions' answer keys. Practice questions are
 * written afterwards, in the background.
 */
export function generateLesson(setId: string) {
  return track(setId, "lesson", async () => {
    const set = getLibrary().sets[setId];
    if (!set?.sections.length) return;
    const material = contextSections(set.sections);
    const raws: unknown[] = [];
    await runObjects("outline", { sections: material }, (v) => raws.push(v));
    const { steps, probes } = buildSteps(raws, material, newId);
    if (!steps.length) throw new AiError("Couldn't plan a lesson from this material. Try again.");
    const title = pickSetTitle(raws);
    updateSet(setId, (s) => ({
      ...s,
      // The file name or first words were a placeholder; the student's own name for the set always wins.
      title: title && !s.titleEdited ? title : s.title,
      items: [...s.items, ...probes],
      lesson: { phase: "gauge", steps, current: 0, createdAt: Date.now() },
    }));
    const groups = Array.from({ length: Math.ceil(probes.length / VERIFY_MAX) }, (_, i) => probes.slice(i * VERIFY_MAX, (i + 1) * VERIFY_MAX));
    await Promise.all(groups.map((g) => verifyItems(setId, g, material)));
  }).then(() => {
    const set = getLibrary().sets[setId];
    if (set?.lesson && !states.get(key(setId, "lesson"))?.running && set.items.length <= set.lesson.steps.length) generateQuestionsSoon(setId);
  });
}

export type Retry = { prompt: string; response: string; answer: string };

/** Streams the explanation for a step at the student's level; with `retry`, a fresh angle on what they just missed. */
export function teachStep(setId: string, stepId: string, retry?: Retry) {
  return track(setId, `teach:${stepId}`, async () => {
    const found = stepOf(setId, stepId);
    if (!found) return;
    const { step, sections } = found;
    const slot = step.explanations.length;
    const familiarity: Familiarity = step.familiarity ?? "new";
    let text = "";
    const save = throttle(() => updateStep(setId, stepId, (st) => ({ ...st, explanations: [...st.explanations.slice(0, slot), text] })), SAVE_EVERY_MS);
    const previous = step.explanations.at(-1)?.slice(0, 6000) ?? "";
    await runTask(
      "teach",
      { sections, title: step.title, goal: step.goal, familiarity, ...(retry ? { retry: { ...retry, previous } } : {}) },
      { onText: (_, all) => ((text = all), save.call()) },
    );
    save.flush();
    if (!text.trim()) throw new AiError("The explanation came back empty. Try again.");
  });
}

/** The step's sections plus their immediate neighbours, for a second try when the step's own text is thin. */
function widen(step: LessonStep, all: Section[]): Section[] {
  const ids = new Set(step.sections.flatMap((id) => [id - 1, id, id + 1]));
  return all.filter((s) => ids.has(s.id));
}

/** Writes questions about `sections` and attaches the grounded ones to the step. */
async function writeOnce(setId: string, stepId: string, sections: Section[], count: number): Promise<Item[]> {
  const set = getLibrary().sets[setId];
  if (!set) return [];
  const written: Item[] = [];
  let raw = 0;
  const avoid = set.items.map((i) => i.prompt.slice(0, 300)).slice(-60);
  await runObjects("questions", { sections, count, avoid, level: "intro" }, (value) => {
    raw++;
    const latest = getLibrary().sets[setId];
    const item = toItem(value, sections, newId("q"));
    if (!latest || !item || isDuplicate(item.prompt, latest.items)) return;
    written.push(item);
    updateSet(setId, (s) => ({ ...s, items: [...s.items, item] }));
    updateStep(setId, stepId, (st) => ({ ...st, checkpointIds: [...st.checkpointIds, item.id] }));
  });
  if (!written.length) console.warn(`[jobs] checkpoint: 0 of ${raw} questions were grounded in the step's text`);
  return written;
}

/** Last resort: reuse checked questions about this step's sections that the step hasn't asked yet. */
function reuseChecked(setId: string, stepId: string): boolean {
  const found = stepOf(setId, stepId);
  if (!found) return false;
  const { set, step } = found;
  const spare = set.items.filter((i) => i.status === "ok" && step.sections.includes(i.section) && !step.checkpointIds.includes(i.id) && i.id !== step.probeId);
  if (!spare.length) return false;
  updateStep(setId, stepId, (st) => ({ ...st, checkpointIds: [...st.checkpointIds, ...spare.slice(0, CHECKPOINTS_PER_STEP).map((i) => i.id)] }));
  return true;
}

/**
 * Gets the step usable checkpoint questions: written from its own sections,
 * then from its neighbours, then reused from checked questions about the
 * same text. Only fails when all three come up empty.
 */
export function writeCheckpoints(setId: string, stepId: string) {
  return track(setId, `check:${stepId}`, async () => {
    const found = stepOf(setId, stepId);
    if (!found) return;
    const tries: [Section[], number][] = [[found.sections, CHECKPOINTS_PER_STEP], [widen(found.step, found.set.sections), CHECKPOINTS_PER_STEP + 1]];
    let lastError: unknown = null;
    for (const [sections, count] of tries) {
      try {
        const written = await writeOnce(setId, stepId, sections, count);
        if (!written.length) continue;
        await verifyItems(setId, written, sections);
        const usable = getLibrary().sets[setId]?.items.filter((i) => written.some((w) => w.id === i.id) && i.status === "ok") ?? [];
        if (usable.length) return;
      } catch (err) {
        if (err instanceof AiError && err.needsConnect) throw err;
        lastError = err;
      }
    }
    if (reuseChecked(setId, stepId)) return;
    throw lastError instanceof Error ? lastError : new AiError("Couldn't write a checkpoint for this step.");
  });
}

/** Saves a change to a step (gauge result, checkpoint outcome) from the lesson screen. */
export const saveStep = updateStep;
