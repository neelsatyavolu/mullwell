"use client";
import { chooseDialog, promptDialog } from "./Dialog";
import { updateItem } from "@/lib/client/store";
import { editAnswer, suspend, unsuspend } from "@/lib/study/items";
import type { Item, ReportReason } from "@/lib/study/types";

// When a question is broken: report it (it sits out of practice and review
// until restored from the Cards tab), or rewrite a short answer's key.

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "wrong-key", label: "The answer is wrong" },
  { value: "unclear", label: "The question is unclear" },
  { value: "not-in-notes", label: "It isn't in my notes" },
  { value: "duplicate", label: "It repeats another question" },
];

export const reasonLabel = (reason: ReportReason | undefined) => REPORT_REASONS.find((r) => r.value === reason)?.label ?? "Reported";

/** Asks why, then suspends the question. Resolves true when it was reported. */
export async function reportQuestion(setId: string, item: Item): Promise<boolean> {
  const reason = await chooseDialog({
    title: "Report this question?",
    body: "It stops appearing in practice and review. You can bring it back from the Cards tab.",
    label: "What's wrong with it",
    options: REPORT_REASONS,
    confirmLabel: "Report",
  });
  if (!reason) return false;
  updateItem(setId, item.id, (i) => suspend(i, reason, Date.now()));
  return true;
}

export function restoreQuestion(setId: string, itemId: string) {
  updateItem(setId, itemId, unsuspend);
}

/** Lets the student rewrite a short or fill-the-blank answer key. Resolves true when it changed. */
export async function editQuestionAnswer(setId: string, item: Item): Promise<boolean> {
  const answer = await promptDialog({
    title: "Edit the answer",
    body: "Future answers are checked against this. The question and its quote stay as they are.",
    label: "Answer",
    value: item.answer,
    confirmLabel: "Save answer",
  });
  if (answer === null || answer === item.answer) return false;
  updateItem(setId, item.id, (i) => editAnswer(i, answer));
  return true;
}
