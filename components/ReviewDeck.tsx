"use client";
import { useEffect, useRef, useState } from "react";
import { Rating } from "ts-fsrs";
import { SourceQuote } from "./QuestionCard";
import { rateCard, useLibrary } from "@/lib/client/store";
import { formatInterval, newCard, previewIntervals } from "@/lib/study/schedule";
import type { ExamItem } from "@/lib/study/exam";

// Flashcard review: recall the answer, reveal, rate how it went. Ratings
// reschedule the card with FSRS; the buttons show when each would bring it back.

const RATINGS = [
  { key: "again", label: "Again", grade: Rating.Again, hotkey: "1" },
  { key: "hard", label: "Hard", grade: Rating.Hard, hotkey: "2" },
  { key: "good", label: "Good", grade: Rating.Good, hotkey: "3" },
  { key: "easy", label: "Easy", grade: Rating.Easy, hotkey: "4" },
] as const;

export function ReviewDeck({ items, emptyText, onCite }: { items: ExamItem[]; emptyText: string; onCite?: (setId: string, section: number) => void }) {
  const { library } = useLibrary();
  // Snapshot the deck at the start: rating a card changes what's due, and the
  // deck must not shift under the student. A deck that started empty picks up
  // cards once some exist.
  const [snapshot, setSnapshot] = useState(items);
  if (snapshot.length === 0 && items.length > 0) setSnapshot(items);
  const deck = snapshot;
  const rated = useRef(-1);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const card = deck[index];
  const intervals = card ? previewIntervals(library.cards[card.id] ?? newCard()) : null;

  function rate(r: (typeof RATINGS)[number]) {
    // One rating per card, even on a double click or a held key.
    if (!card || rated.current === index) return;
    rated.current = index;
    rateCard(card.id, r.grade);
    setTally((t) => ({ ...t, [r.key]: t[r.key] + 1 }));
    setRevealed(false);
    setIndex((i) => i + 1);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card || e.repeat || ["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === " " && !revealed) {
        e.preventDefault();
        setRevealed(true);
      }
      const r = revealed && RATINGS.find((x) => x.hotkey === e.key);
      if (r) rate(r);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!deck.length) return <p className="empty">{emptyText}</p>;
  if (!card) {
    const total = tally.again + tally.hard + tally.good + tally.easy;
    return (
      <div className="card stack fade-in">
        <p className="label">Review done</p>
        <h2 className="title num">{total} {total === 1 ? "card" : "cards"} reviewed</h2>
        <p className="muted num">
          {tally.good + tally.easy} recalled well, {tally.hard} with effort, {tally.again} to see again soon.
        </p>
      </div>
    );
  }

  const label = library.sets[card.setId]?.sections.find((s) => s.id === card.section)?.title ?? "Your notes";
  return (
    <div className="stack">
      <div className="stack" style={{ gap: 6 }}>
        <div className="spread small muted num">
          <span>{index + 1} of {deck.length}</span>
          <span className="faint">{library.sets[card.setId]?.title}</span>
        </div>
        <div className="progress" aria-hidden><span style={{ width: `${(index / deck.length) * 100}%` }} /></div>
      </div>
      <div
        className="card flashcard fade-in"
        key={card.id + String(revealed)}
        onClick={() => setRevealed(true)}
        role="button"
        tabIndex={0}
        aria-label={revealed ? "Answer shown" : "Show answer"}
        onKeyDown={(e) => e.key === "Enter" && setRevealed(true)}
      >
        <h2 className="question">{card.prompt}</h2>
        {card.kind === "mcq" && !revealed && (
          <ul className="muted small" style={{ margin: 0, paddingLeft: 18 }}>
            {card.choices?.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        )}
        {revealed ? (
          <div className="stack" onClick={(e) => e.stopPropagation()}>
            <p className="reading"><strong>{card.answer}</strong></p>
            <SourceQuote item={card} label={label} onCite={onCite ? (n) => onCite(card.setId, n) : undefined} />
          </div>
        ) : (
          <p className="small faint">Answer in your head, then tap or press <span className="kbd">Space</span>.</p>
        )}
      </div>
      {revealed && intervals && (
        <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {RATINGS.map((r) => (
            <button key={r.key} type="button" className={`btn ${r.key === "good" ? "btn-primary" : ""}`} style={{ height: 56, flexDirection: "column", gap: 0 }} onClick={() => rate(r)}>
              <span>{r.label}</span>
              <span className="small num" style={{ opacity: 0.75 }}>{formatInterval(intervals[r.key])}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
