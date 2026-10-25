import { createEmptyCard, fsrs, Rating, type Card, type Grade } from "ts-fsrs";
import type { Confidence, Verdict } from "./types";

// Spaced review with FSRS. Each checked question is a card. Practice answers
// schedule it from the verdict and the student's confidence; in Review the
// student rates their own recall.

// No fuzz, so the interval shown on a rating button is the one that's applied.
const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: false });

export type StoredCard = Omit<Card, "due" | "last_review"> & { due: number; last_review: number | null };

export const newCard = (now = Date.now()): StoredCard => toStored(createEmptyCard(new Date(now)));

function toStored(card: Card): StoredCard {
  return { ...card, due: card.due.getTime(), last_review: card.last_review ? card.last_review.getTime() : null };
}

function fromStored(card: StoredCard): Card {
  return { ...card, due: new Date(card.due), last_review: card.last_review ? new Date(card.last_review) : undefined };
}

/** A right answer you were only guessing at is not yet learned; a confident miss needs to come back soon. */
export function gradeFor(verdict: Verdict, confidence: Confidence): Grade {
  if (verdict === "wrong") return Rating.Again;
  if (verdict === "partly") return Rating.Hard;
  if (confidence === "guess") return Rating.Hard;
  return confidence === "sure" ? Rating.Easy : Rating.Good;
}

export function review(card: StoredCard, grade: Grade, now = Date.now()): StoredCard {
  return toStored(scheduler.next(fromStored(card), new Date(now), grade).card);
}

/** When each rating would bring the card back, for the rating buttons. */
export function previewIntervals(card: StoredCard, now = Date.now()): Record<"again" | "hard" | "good" | "easy", number> {
  const preview = scheduler.repeat(fromStored(card), new Date(now));
  return {
    again: preview[Rating.Again].card.due.getTime() - now,
    hard: preview[Rating.Hard].card.due.getTime() - now,
    good: preview[Rating.Good].card.due.getTime() - now,
    easy: preview[Rating.Easy].card.due.getTime() - now,
  };
}

export function formatInterval(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months} mo` : `${Math.round(days / 365)} y`;
}

export const isDue = (card: StoredCard, now = Date.now()) => card.due <= now;

/** Chance the student still recalls this card at `at` (0 to 1). A card never studied counts as 0. */
export function recallAt(card: StoredCard | undefined, at: number): number {
  if (!card || card.reps === 0) return 0;
  return scheduler.get_retrievability(fromStored(card), new Date(at), false);
}
