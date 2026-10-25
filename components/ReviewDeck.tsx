"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Rating } from "ts-fsrs";
import { SourceQuote } from "./QuestionCard";
import { attemptCounts } from "@/lib/client/derived";
import { getLibrary, recordReview, restoreReview, useLibrary } from "@/lib/client/store";
import { formatInterval, newCard, previewIntervals, type StoredCard } from "@/lib/study/schedule";
import { choiceOrder, seedFor } from "@/lib/study/shuffle";
import type { ExamItem } from "@/lib/study/exam";

// Flashcard review: recall the answer, reveal, rate how it went. Ratings
// reschedule the card with FSRS; the buttons show when each would bring it back.
// The last rating can be undone until the next one. Multiple-choice cards hide
// their options at first, so the student recalls the answer instead of
// recognising it. A card rated Again comes back at the end of the deck, at
// most twice. In browse mode the student just flips through: nothing is saved.

const RATINGS = [
  { key: "again", label: "Again", grade: Rating.Again, hotkey: "1" },
  { key: "hard", label: "Hard", grade: Rating.Hard, hotkey: "2" },
  { key: "good", label: "Good", grade: Rating.Good, hotkey: "3" },
  { key: "easy", label: "Easy", grade: Rating.Easy, hotkey: "4" },
] as const;
const MAX_RESHOWS = 2;
type RatingKey = (typeof RATINGS)[number]["key"];

/** The done screen's one next step: a link, or an action. `note` says why, above it. */
export type ReviewNext = { label: string; href?: string; onClick?: () => void; note?: string };

/** What the last rating changed, so Undo can put it back. */
type LastRating = { index: number; itemId: string; prevCard: StoredCard | null; attemptKey: string; deckLength: number; prevFinal?: RatingKey };

type Props = {
  items: ExamItem[];
  emptyText: string;
  onCite?: (setId: string, section: number) => void;
  next?: ReviewNext;
  /** "browse" flips through the cards with Previous and Next and saves nothing. */
  mode?: "review" | "browse";
};

export function ReviewDeck({ items, emptyText, onCite, next, mode = "review" }: Props) {
  const { library } = useLibrary();
  const browsing = mode === "browse";
  // Snapshot the deck at the start: rating a card changes what's due, and the
  // deck must not shift under the student. A deck that started empty picks up
  // cards once some exist. Cards rated Again are appended.
  const [deck, setDeck] = useState(items);
  if (deck.length === 0 && items.length > 0) setDeck(items);
  const rated = useRef(-1);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [choicesShown, setChoicesShown] = useState(false);
  // Each card's latest rating, so the tally counts cards rather than ratings.
  const [finals, setFinals] = useState<Record<string, RatingKey>>({});
  const [last, setLast] = useState<LastRating | null>(null);
  const card = deck[index];
  const intervals = card && !browsing ? previewIntervals(library.cards[card.id] ?? newCard()) : null;

  function show(i: number, reveal = false) {
    setIndex(i);
    setRevealed(reveal);
    setChoicesShown(false);
  }

  function rate(r: (typeof RATINGS)[number]) {
    // One rating per card, even on a double click or a held key.
    if (!card || browsing || rated.current === index) return;
    rated.current = index;
    const prevCard = getLibrary().cards[card.id] ?? null;
    const attemptKey = recordReview(card.setId, card.id, r.grade);
    setLast({ index, itemId: card.id, prevCard, attemptKey, deckLength: deck.length, prevFinal: finals[card.id] });
    setFinals((f) => ({ ...f, [card.id]: r.key }));
    const shown = deck.filter((c) => c.id === card.id).length;
    if (r.grade === Rating.Again && shown <= MAX_RESHOWS) setDeck([...deck, card]);
    show(index + 1);
  }

  /** Puts the card and its schedule back as they were before the last rating, answer showing. */
  function undo() {
    if (!last) return;
    restoreReview(last.itemId, last.prevCard, last.attemptKey);
    setDeck((d) => d.slice(0, last.deckLength));
    setFinals((f) => {
      const rest = Object.fromEntries(Object.entries(f).filter(([id]) => id !== last.itemId));
      return last.prevFinal ? { ...rest, [last.itemId]: last.prevFinal } : rest;
    });
    rated.current = -1;
    setLast(null);
    show(last.index, true);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // defaultPrevented: the tab list already used the arrow key.
      if (e.repeat || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (e.key === "z" && last) return undo();
      if (browsing && e.key === "ArrowLeft" && index > 0) return show(index - 1);
      if (!card) return;
      // Space on a button reached with the keyboard presses that button (Undo, Previous…), not the reveal.
      const keyboardButton = Boolean(target.closest?.("button, a, select")) && target.matches?.(":focus-visible");
      if (e.key === " " && !revealed && !keyboardButton) {
        e.preventDefault();
        setRevealed(true);
      }
      if (browsing && e.key === "ArrowRight") return show(index + 1);
      const r = revealed && RATINGS.find((x) => x.hotkey === e.key);
      if (r) rate(r);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const undoButton = last && (
    <button type="button" className="btn btn-ghost btn-sm" aria-keyshortcuts="z" title="Undo (Z)" onClick={undo}>Undo last rating</button>
  );

  if (!deck.length) return <p className="empty">{emptyText}</p>;
  if (!card) {
    const ratings = Object.values(finals);
    const tally = (k: RatingKey) => ratings.filter((x) => x === k).length;
    const total = ratings.length;
    return (
      <div className="card stack fade-in">
        <p className="label">{browsing ? "All cards" : "Review done"}</p>
        {browsing ? (
          <h2 className="title num">{deck.length} {deck.length === 1 ? "card" : "cards"} looked through</h2>
        ) : (
          <>
            <h2 className="title num">{total} {total === 1 ? "card" : "cards"} reviewed</h2>
            <p className="muted num">
              {tally("good") + tally("easy")} recalled well, {tally("hard")} with effort, {tally("again")} to see again soon.
            </p>
          </>
        )}
        {next?.note && <p className="num">{next.note}</p>}
        <div className="row">
          {next && (next.href ? <Link href={next.href} className="btn btn-primary">{next.label}</Link> : <button type="button" className="btn btn-primary" onClick={next.onClick}>{next.label}</button>)}
          {browsing && <button type="button" className="btn btn-ghost" onClick={() => show(0)}>Start over</button>}
          {undoButton}
        </div>
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
      {/* Tap anywhere on the card to reveal; the button below is the accessible way in. */}
      <div className="card flashcard fade-in" key={index} onClick={revealed ? undefined : () => setRevealed(true)} style={revealed ? { cursor: "default" } : undefined}>
        <h2 className="question">{card.prompt}</h2>
        {card.kind === "mcq" && !revealed && (choicesShown ? (
          <ul className="muted small" style={{ margin: 0, paddingLeft: 18 }}>
            {choiceOrder(card, seedFor(card.id, attemptCounts(library).get(card.id) ?? 0)).map((i) => <li key={i}>{card.choices?.[i]}</li>)}
          </ul>
        ) : (
          <div className="row">
            <p className="small muted">Say the answer in your head.</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => (e.stopPropagation(), setChoicesShown(true))}>Show choices</button>
          </div>
        ))}
        <section aria-live="polite">
          {revealed && (
            <div className="stack fade-in">
              <p className="reading"><strong>{card.answer}</strong></p>
              <SourceQuote item={card} label={label} onCite={onCite ? (n) => onCite(card.setId, n) : undefined} />
            </div>
          )}
        </section>
        {!revealed && <p className="small muted">Answer in your head, then tap or press <span className="kbd">Space</span>.</p>}
      </div>
      {browsing ? (
        <div className="spread">
          <button type="button" className="btn" disabled={index === 0} aria-keyshortcuts="ArrowLeft" onClick={() => show(index - 1)}>Previous</button>
          <div className="row">
            {!revealed && <button type="button" className="btn btn-primary" onClick={() => setRevealed(true)}>Show answer</button>}
            <button type="button" className={`btn ${revealed ? "btn-primary" : ""}`} aria-keyshortcuts="ArrowRight" onClick={() => show(index + 1)}>Next</button>
          </div>
        </div>
      ) : revealed && intervals ? (
        <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {RATINGS.map((r) => (
            <button key={r.key} type="button" className={`btn ${r.key === "good" ? "btn-primary" : ""}`} style={{ height: 56, flexDirection: "column", gap: 0 }} onClick={() => rate(r)}>
              <span>{r.label}</span>
              <span className="small num" style={{ opacity: 0.75 }}>{formatInterval(intervals[r.key])}</span>
            </button>
          ))}
        </div>
      ) : (
        <button type="button" className="btn btn-primary" style={{ height: 56, width: "100%" }} aria-keyshortcuts="Space" onClick={() => setRevealed(true)}>Show answer</button>
      )}
      {undoButton && <div className="row" style={{ justifyContent: "flex-end" }}>{undoButton}</div>}
    </div>
  );
}
