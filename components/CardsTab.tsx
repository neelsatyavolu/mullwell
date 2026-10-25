"use client";
import { useState } from "react";
import { reasonLabel, restoreQuestion } from "./FixQuestion";
import { ReviewDeck } from "./ReviewDeck";
import { readyItems } from "@/lib/client/derived";
import { generateQuestions } from "@/lib/client/jobs";
import { useLibrary } from "@/lib/client/store";
import { isDue } from "@/lib/study/schedule";
import type { StudySet } from "@/lib/study/types";

// A set's flashcards. Due reviews the cards whose time has come (ratings
// reschedule them); All cards flips through every card without saving
// anything. Reported questions wait in a list until restored.

type Props = {
  set: StudySet;
  writing: boolean;
  onPractice: () => void;
  onCite: (section: number) => void;
};

export function CardsTab({ set, writing, onPractice, onCite }: Props) {
  const { library } = useLibrary();
  const [openedAt] = useState(() => Date.now());
  const ready = readyItems(library, [set.id]);
  const due = ready.filter((i) => library.cards[i.id] && isDue(library.cards[i.id], openedAt));
  const reported = set.items.filter((i) => i.status === "suspended");
  // Due when there's something to review, else All; fixed once so rating the last due card doesn't flip it.
  const [mode, setMode] = useState<"due" | "all">(() => (due.length ? "due" : "all"));
  const [showReported, setShowReported] = useState(false);

  return (
    <div className="stack">
      {(ready.length > 0 || reported.length > 0) && (
        <div className="spread">
          {ready.length > 0 ? (
            <div className="modes" role="group" aria-label="Which cards">
              <button type="button" className="mode num" aria-pressed={mode === "due"} onClick={() => setMode("due")}>Due ({due.length})</button>
              <button type="button" className="mode num" aria-pressed={mode === "all"} onClick={() => setMode("all")}>All cards ({ready.length})</button>
            </div>
          ) : <span />}
          {reported.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm num" aria-expanded={showReported} onClick={() => setShowReported((s) => !s)}>Reported ({reported.length})</button>
          )}
        </div>
      )}

      {showReported && reported.length > 0 && (
        <div className="card stack fade-in" style={{ gap: 8 }}>
          <p className="label">Reported questions</p>
          <p className="small muted">These sit out of practice and review until you bring them back.</p>
          {reported.map((item) => (
            <div key={item.id} className="inset small spread">
              <span className="stack" style={{ flex: "1 1 240px", minWidth: 0, gap: 2 }}>
                <span className="clamp-2">{item.prompt}</span>
                <span className="muted">{reasonLabel(item.report?.reason)}</span>
              </span>
              <button type="button" className="btn btn-sm" onClick={() => restoreQuestion(set.id, item.id)}>Unsuspend</button>
            </div>
          ))}
        </div>
      )}

      {ready.length === 0 ? (
        writing ? (
          <p className="empty">Cards appear as questions are written and checked.</p>
        ) : (
          <div className="empty stack" style={{ alignItems: "center", gap: 12 }}>
            <p>No cards yet.</p>
            {set.sections.length > 0 && <button type="button" className="btn btn-primary" onClick={() => void generateQuestions(set.id)}>Write questions</button>}
          </div>
        )
      ) : (
        <ReviewDeck
          key={mode}
          mode={mode === "due" ? "review" : "browse"}
          items={mode === "due" ? due : ready}
          onCite={(_, n) => onCite(n)}
          emptyText="Nothing here is due right now. All cards lets you flip through them."
          next={{ label: "Practice this set", onClick: onPractice }}
        />
      )}
    </div>
  );
}
