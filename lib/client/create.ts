"use client";
import { generateLesson, generatePrimer, generateQuestionsSoon, transcribePhotos } from "./jobs";
import { getLibrary, saveSet, updateSet } from "./store";
import { batches, guessTitle, toSections } from "@/lib/study/chunk";
import { newId } from "@/lib/study/ids";
import type { Origin, StudySet } from "@/lib/study/types";

// Creating a set returns at once so the set page can open while questions
// are written; the slow parts happen in background jobs.

export const MAX_MATERIAL_CHARS = 400_000;

function blank(courseId: string | null, title: string, origin: Origin): StudySet {
  const now = Date.now();
  return { id: newId("s"), courseId, title, origin, createdAt: now, updatedAt: now, sections: [], sources: [], items: [], nextBatch: 0, notes: null, map: null, podcast: null };
}

export function createFromText(text: string, courseId: string | null, title?: string): string {
  const trimmed = text.slice(0, MAX_MATERIAL_CHARS);
  const set = { ...blank(courseId, title?.trim() || guessTitle(trimmed), "notes"), sections: toSections(trimmed) };
  saveSet(set);
  // A lesson first; practice questions follow once it's planned.
  void generateLesson(set.id);
  return set.id;
}

export function createFromTopic(topic: string, courseId: string | null, level: "intro" | "exam"): string {
  const set = blank(courseId, topic.trim().slice(0, 80), "web");
  saveSet(set);
  void generatePrimer(set.id, topic.trim(), level);
  return set.id;
}

/** Photos of notes are transcribed in the background; the set opens right away. */
export function createFromImages(images: string[], courseId: string | null, title: string): string {
  const set = { ...blank(courseId, title, "notes"), notes: "" };
  saveSet(set);
  void transcribePhotos(set.id, images);
  return set.id;
}

/** Adds more material (another lecture, chapter or photo transcript) to an existing set. */
export function appendText(setId: string, text: string) {
  const set = getLibrary().sets[setId];
  if (!set) return;
  const offset = set.sections.length;
  const added = toSections(text).map((s) => ({ ...s, id: s.id + offset }));
  // The last old batch may absorb the first new section, so start from it.
  const firstNewBatch = Math.max(0, batches(set.sections).length - 1);
  updateSet(setId, (s) => ({ ...s, sections: [...s.sections, ...added], nextBatch: firstNewBatch, notes: null, map: null, podcast: null }));
  generateQuestionsSoon(setId);
}
