"use client";
import { VERDICT_TEXT } from "./QuestionCard";
import { useLibrary } from "@/lib/client/store";
import { calibration, calibrationLine } from "@/lib/study/calibration";
import { formatInterval } from "@/lib/study/schedule";
import type { ExamItem } from "@/lib/study/exam";
import type { AttemptSource, Confidence, Verdict } from "@/lib/study/types";

// The end of a practice round: how it went, what came back and stuck, what's
// still missed, and one next step.

/** One graded answer in a session. `first` is false for a re-ask of a missed question. */
export type Result = { id: string; verdict: Verdict; confidence: Confidence; first: boolean; source?: AttemptSource; response: string };

type Props = {
  round: Result[];
  items: Map<string, ExamItem>;
  lastAt: number;
  writing?: boolean;
  onKeepGoing?: () => void;
  onMore?: () => void;
  onDone?: () => void;
  doneLabel?: string;
  onCite?: (setId: string, section: number) => void;
};

export function PracticeDone({ round, items, lastAt, writing, onKeepGoing, onMore, onDone, doneLabel = "Done", onCite }: Props) {
  const { library } = useLibrary();
  const firsts = round.filter((r) => r.first);
  const final = new Map(round.map((r) => [r.id, r.verdict]));
  const right = firsts.filter((r) => r.verdict === "right").length;
  const cameBack = firsts.filter((r) => r.verdict !== "right" && final.get(r.id) === "right").length;
  const missed = [...final].filter(([, v]) => v !== "right");
  // First tries only: a re-ask comes right after seeing the answer.
  const judged = calibrationLine(calibration(firsts));
  const soonest = firsts
    .map((r) => library.cards[r.id]?.due)
    .filter((d): d is number => typeof d === "number")
    .sort((a, b) => a - b)[0];
  return (
    <div className="card stack fade-in">
      <p className="label">Session done</p>
      <h2 className="title num">{right} of {firsts.length} right</h2>
      {cameBack > 0 && <p className="num">Came back and got it: {cameBack}</p>}
      <p className="muted">
        {missed.length ? `${missed.length} missed ${missed.length === 1 ? "question comes" : "questions come"} back soon. ` : ""}
        {soonest ? `Next review in ${formatInterval(soonest - lastAt)}.` : ""} Spacing reviews out is what makes this stick.
      </p>
      {judged && <p className="small muted num">{judged}</p>}
      {missed.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <p className="small muted">Still missed</p>
          {missed.map(([id, verdict]) => {
            const item = items.get(id);
            if (!item) return null;
            return (
              <div key={id} className="inset small spread">
                <span className="clamp-2" style={{ flex: "1 1 240px", minWidth: 0 }}>{item.prompt}</span>
                <span className="row" style={{ gap: 6 }}>
                  {/* Tone on the icon only, as in the verdict strip: amber text at 14px fails AA. */}
                  <span>
                    <span aria-hidden style={{ color: verdict === "partly" ? "var(--warn)" : "var(--bad)" }}>{verdict === "partly" ? "≈" : "✕"}</span> {VERDICT_TEXT[verdict]}
                  </span>
                  {onCite ? (
                    <button type="button" className="cite" onClick={() => onCite(item.setId, item.section)}>§{item.section}</button>
                  ) : (
                    <span className="cite">§{item.section}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div className="row">
        {onKeepGoing ? (
          <button className="btn btn-primary" onClick={onKeepGoing}>Keep going</button>
        ) : onMore ? (
          <button className="btn btn-primary" disabled={writing} onClick={onMore}>
            {writing ? "Writing questions…" : "More questions"}
          </button>
        ) : onDone ? (
          <button className="btn btn-primary" onClick={onDone}>{doneLabel}</button>
        ) : null}
      </div>
    </div>
  );
}
