"use client";
import { useRef, useState } from "react";
import { PracticeDone, type Result } from "./PracticeDone";
import { QuestionCard, type Graded } from "./QuestionCard";
import { attemptsList } from "@/lib/client/derived";
import { getLibrary, overrideAnswer, recordAnswer, useLibrary } from "@/lib/client/store";
import { orderForPractice, requeue } from "@/lib/study/queue";
import type { ExamItem } from "@/lib/study/exam";
import type { StoredCard } from "@/lib/study/schedule";
import type { Confidence, Item, Verdict } from "@/lib/study/types";

// A practice session over a list of questions, most-needed first. A missed
// question comes back a few cards later until it's right (at most twice more).
// The student can overrule a grade ("I was right") or report a broken question,
// which leaves the session once they move on. New questions that arrive while the student works join the end (for a set
// still generating).

const REASK_GAP = 3;
const MAX_REASKS = 2;

/** The grade on screen, so "I was right" can replace it. */
type LastGrade = { itemId: string; prevCard: StoredCard | null; attemptKey: string; confidence: Confidence; response: string };

type Props = {
  items: ExamItem[];
  /** Waiting for more questions to be written. */
  writing?: boolean;
  size?: number;
  onMore?: () => void;
  /** Shown as the last step when there's nothing more to practice and no onMore. */
  onDone?: () => void;
  /** The label of the onDone button ("Done" when unset). */
  doneLabel?: string;
  onCite?: (setId: string, section: number) => void;
  onAskTutor?: (item: Item) => void;
  emptyText?: string;
  /** False while the panel is hidden behind another tab. */
  active?: boolean;
};

export function Practice({ items, writing, size = 6, onMore, onDone, doneLabel, onCite, onAskTutor, emptyText, active = true }: Props) {
  const { library } = useLibrary();
  // The latest copy of each question: Review and a test's study mode pass a
  // snapshot, and a report or an edited answer must still show.
  const latest = items.map((i) => {
    const stored = library.sets[i.setId]?.items.find((x) => x.id === i.id);
    return stored ? { ...stored, setId: i.setId } : i;
  });
  // The question on screen stays there after grading until the student moves on, even once reported.
  const [showing, setShowing] = useState<string | null>(null);
  const visible = latest.filter((i) => i.status !== "dropped" && (i.status !== "suspended" || i.id === showing));
  const byId = new Map(visible.map((i) => [i.id, i]));
  const [openedAt] = useState(() => Date.now());
  const seed = () => orderForPractice(visible, library.cards, attemptsList(library), openedAt).map((i) => i.id);
  // The order is fixed when the session first shows, so questions don't shift
  // mid-round. Answered ones leave it; misses are put back a few places later.
  const [upcoming, setUpcoming] = useState<string[] | null>(() => (active ? seed() : null));
  if (upcoming === null && active) setUpcoming(seed());
  // Index into results where the current round began.
  const [roundStart, setRoundStart] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [lastAt, setLastAt] = useState(0);
  const lastGrade = useRef<LastGrade | null>(null);

  const tries = new Map<string, number>();
  for (const r of results) tries.set(r.id, (tries.get(r.id) ?? 0) + 1);
  const listed = upcoming ?? [];
  const queue = [...listed.filter((id) => byId.has(id)), ...visible.filter((i) => !listed.includes(i.id) && !tries.has(i.id)).map((i) => i.id)];
  const unseen = queue.filter((id) => !tries.has(id)).length;
  const round = results.slice(roundStart);
  const firsts = round.filter((r) => r.first).length;
  const held = showing ? byId.get(showing) ?? null : null;
  // A round is `size` new questions; once they're asked, only its re-asks are left.
  const next = firsts >= size ? queue.find((id) => tries.has(id)) : queue[0];
  const sessionDone = !held && round.length > 0 && next === undefined && (firsts >= size || !writing);
  const current = held ?? (sessionDone || next === undefined ? null : byId.get(next) ?? null);
  const dropped = latest.filter((i) => i.status === "dropped").length;
  const label = (i: ExamItem) => library.sets[i.setId]?.sections.find((s) => s.id === i.section)?.title ?? "Your notes";

  function graded(item: ExamItem, verdict: Verdict, confidence: Confidence, response: string, g: Graded) {
    const prevCard = getLibrary().cards[item.id] ?? null;
    const attemptKey = recordAnswer(item.setId, item.id, verdict, confidence, { mode: "practice", response, feedback: g.feedback, missing: g.missing, source: g.source });
    lastGrade.current = { itemId: item.id, prevCard, attemptKey, confidence, response };
    const tried = (tries.get(item.id) ?? 0) + 1;
    const rest = queue.filter((id) => id !== item.id);
    setUpcoming(verdict !== "right" && tried <= MAX_REASKS ? requeue(rest, item.id, REASK_GAP) : rest);
    setResults((r) => [...r, { id: item.id, verdict, confidence, first: tried === 1, source: g.source, response }]);
    setShowing(item.id);
    setLastAt(Date.now());
  }

  /** "I was right": swaps the stored grade for a right one and cancels the re-ask. */
  function overrule(item: ExamItem) {
    const last = lastGrade.current;
    if (!last || last.itemId !== item.id) return;
    lastGrade.current = null;
    overrideAnswer(item.setId, item.id, last.prevCard, last.attemptKey, last.confidence, { mode: "practice", response: last.response });
    setUpcoming((u) => u?.filter((id) => id !== item.id) ?? u);
    setResults((r) => r.map((x, i) => (i === r.length - 1 && x.id === item.id ? { ...x, verdict: "right", source: "self" } : x)));
  }

  if (sessionDone) {
    const keepGoing = () => setRoundStart(results.length);
    return (
      <PracticeDone
        round={round}
        items={byId}
        lastAt={lastAt}
        writing={writing}
        onKeepGoing={unseen > 0 ? keepGoing : undefined}
        onMore={onMore ? () => (onMore(), keepGoing()) : undefined}
        onDone={onDone}
        doneLabel={doneLabel}
        onCite={onCite}
      />
    );
  }

  if (!current) {
    if (writing) return <WritingPlaceholder />;
    return <p className="empty">{emptyText ?? "No questions here yet."}</p>;
  }

  // Answers to this question before the one on screen; above zero means it's a re-ask.
  const prior = (tries.get(current.id) ?? 0) - (held ? 1 : 0);
  const done = firsts - (held && results.at(-1)?.first ? 1 : 0);
  const total = Math.min(size, firsts + unseen);
  return (
    <div className="stack">
      <div className="stack" style={{ gap: 6 }}>
        <div className="spread small muted num">
          <span>{prior > 0 ? "Back to one you missed" : <>{done + 1} of {total}{writing && total < size ? "+" : ""}</>}</span>
          {dropped > 0 && <span>{dropped} {dropped === 1 ? "question" : "questions"} failed the answer check and {dropped === 1 ? "was" : "were"} removed</span>}
        </div>
        <div className="progress" aria-hidden><span style={{ width: `${(done / Math.max(1, total)) * 100}%` }} /></div>
      </div>
      <QuestionCard
        key={`${current.id}:${prior}`}
        item={current}
        sourceLabel={label(current)}
        onGraded={(v, c, r, g) => graded(current, v, c, r, g)}
        onOverride={() => overrule(current)}
        setId={current.setId}
        onNext={() => setShowing(null)}
        onCite={onCite ? (n) => onCite(current.setId, n) : undefined}
        onAskTutor={onAskTutor}
        active={active}
      />
    </div>
  );
}

export function WritingPlaceholder({ text = "Writing your first questions from your material…" }: { text?: string }) {
  return (
    <div className="card stack" aria-busy>
      <p className="muted pulse">{text}</p>
      <div className="skeleton" style={{ width: "80%", height: 18 }} />
      <div className="skeleton" style={{ width: "55%", height: 18 }} />
      <div className="skeleton" style={{ height: 72, marginTop: 8 }} />
    </div>
  );
}
