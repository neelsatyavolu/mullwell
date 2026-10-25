"use client";
import { useMemo, useState } from "react";
import { QuestionCard } from "./QuestionCard";
import { recordAnswer, useLibrary } from "@/lib/client/store";
import { formatInterval } from "@/lib/study/schedule";
import type { ExamItem } from "@/lib/study/exam";
import type { Item, Verdict } from "@/lib/study/types";

// A practice session over a fixed list of questions. New questions that
// arrive while the student works are appended (for a set still generating).

type Props = {
  items: ExamItem[];
  /** Waiting for more questions to be written. */
  writing?: boolean;
  size?: number;
  onMore?: () => void;
  onCite?: (setId: string, section: number) => void;
  onAskTutor?: (item: Item) => void;
  emptyText?: string;
  /** False while the panel is hidden behind another tab. */
  active?: boolean;
};

export function Practice({ items, writing, size = 6, onMore, onCite, onAskTutor, emptyText, active = true }: Props) {
  const { library } = useLibrary();
  // The session's order is fixed when it starts; questions written later join the end.
  const [taken, setTaken] = useState<string[]>([]);
  // Index into results where the current round began.
  const [roundStart, setRoundStart] = useState(0);
  const [results, setResults] = useState<{ id: string; verdict: Verdict }[]>([]);
  // The question on screen stays there after grading until the student moves on.
  const [showing, setShowing] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState(0);
  const answeredIds = useMemo(() => new Set(results.map((r) => r.id)), [results]);

  const visible = items.filter((i) => i.status !== "dropped");
  const queue = useMemo(() => {
    const ordered = [...taken.map((id) => visible.find((i) => i.id === id)).filter((i): i is ExamItem => Boolean(i)), ...visible.filter((i) => !taken.includes(i.id))];
    return ordered;
  }, [taken, visible]);
  const remaining = queue.filter((i) => !answeredIds.has(i.id));
  const held = showing ? queue.find((i) => i.id === showing) ?? null : null;
  const sessionDone = !held && (results.length - roundStart >= size || (remaining.length === 0 && !writing && results.length > 0));
  const current = held ?? (sessionDone ? null : remaining[0]);
  const dropped = items.filter((i) => i.status === "dropped").length;
  const label = (i: ExamItem) => library.sets[i.setId]?.sections.find((s) => s.id === i.section)?.title ?? "Your notes";

  function graded(item: ExamItem, verdict: Verdict, confidence: Parameters<typeof recordAnswer>[3]) {
    recordAnswer(item.setId, item.id, verdict, confidence);
    setTaken((t) => (t.includes(item.id) ? t : [...t, item.id]));
    setResults((r) => [...r, { id: item.id, verdict }]);
    setShowing(item.id);
    setLastAt(Date.now());
  }

  if (sessionDone) {
    const mine = results.slice(roundStart);
    const right = mine.filter((r) => r.verdict === "right").length;
    const missed = mine.filter((r) => r.verdict !== "right").length;
    const soonest = mine
      .map((r) => library.cards[r.id]?.due)
      .filter((d): d is number => typeof d === "number")
      .sort((a, b) => a - b)[0];
    const more = remaining.length > 0;
    return (
      <div className="card stack fade-in">
        <p className="label">Session done</p>
        <h2 className="title num">{right} of {mine.length} right</h2>
        <p className="muted">
          {missed ? `${missed} missed ${missed === 1 ? "question comes" : "questions come"} back soon. ` : ""}
          {soonest ? `Next review in ${formatInterval(soonest - lastAt)}.` : ""} Spacing reviews out is what makes this stick.
        </p>
        <div className="row">
          {more ? (
            <button className="btn btn-primary" onClick={() => setRoundStart(results.length)}>Keep going</button>
          ) : onMore ? (
            <button className="btn btn-primary" disabled={writing} onClick={() => (onMore(), setRoundStart(results.length))}>
              {writing ? "Writing questions…" : "More questions"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!current) {
    if (writing) return <WritingPlaceholder />;
    return <p className="empty">{emptyText ?? "No questions here yet."}</p>;
  }

  const done = results.length - roundStart - (held ? 1 : 0);
  const total = Math.min(size, done + remaining.length + (held ? 1 : 0));
  return (
    <div className="stack">
      <div className="stack" style={{ gap: 6 }}>
        <div className="spread small muted num">
          <span>{done + 1} of {total}{writing && total < size ? "+" : ""}</span>
          {dropped > 0 && <span className="faint">{dropped} {dropped === 1 ? "question" : "questions"} failed the answer check and {dropped === 1 ? "was" : "were"} removed</span>}
        </div>
        <div className="progress" aria-hidden><span style={{ width: `${(done / Math.max(1, total)) * 100}%` }} /></div>
      </div>
      <QuestionCard
        key={current.id}
        item={current}
        sourceLabel={label(current)}
        onGraded={(v, c) => graded(current, v, c)}
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
