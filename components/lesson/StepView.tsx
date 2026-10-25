"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { QuestionCard } from "../QuestionCard";
import { BeatCard } from "./BeatCard";
import { saveStep, teachStep, useJob, writeCheckpoints, type Retry } from "@/lib/client/jobs";
import { recordAnswer } from "@/lib/client/store";
import { parseBeats } from "@/lib/study/beats";
import { afterCheckpoint, needsReteach } from "@/lib/study/lesson";
import type { Item, LessonStep, StudySet } from "@/lib/study/types";

// One lesson step, paced by buttons: an intro, then the explanation one beat
// at a time, then a checkpoint. A miss brings a short re-explanation aimed at
// the wrong answer and a new checkpoint; a second miss marks the step for
// review and moves on.

const FAMILIARITY_LABEL = { new: "New to you", shaky: "Partly known", known: "You know this" } as const;

type Screen = { kind: "intro" } | { kind: "beats"; round: number; index: number } | { kind: "check" };

type Props = {
  set: StudySet;
  step: LessonStep;
  index: number;
  total: number;
  next: LessonStep | null;
  onDone: () => void;
  onCite: (section: number) => void;
  onAskTutor: (item: Item) => void;
  /** False while the Learn tab is hidden, so its answer hotkeys stay off. */
  active: boolean;
};

export function StepView({ set, step, index, total, next, onDone, onCite, onAskTutor, active }: Props) {
  const teach = useJob(set.id, `teach:${step.id}`);
  const check = useJob(set.id, `check:${step.id}`);
  const [screen, setScreen] = useState<Screen>({ kind: "intro" });
  // The missed checkpoint, kept so the re-explanation can address the actual answer.
  const [retry, setRetry] = useState<Retry | null>(null);
  // A graded checkpoint stays on screen until the student presses Next.
  const [shownId, setShownId] = useState<string | null>(null);
  const started = useRef<string | null>(null);

  const usable = step.checkpointIds.map((id) => set.items.find((i) => i.id === id)).filter((i): i is Item => Boolean(i) && i!.status !== "dropped");
  const checkpoint = (shownId ? usable.find((i) => i.id === shownId) : null) ?? usable[step.tries] ?? null;
  const reteach = needsReteach(step);

  // The explanation and checkpoints start while the student reads the intro, and the next step gets ready too.
  useEffect(() => {
    if (started.current === step.id) return;
    started.current = step.id;
    if (!step.explanations.length) void teachStep(set.id, step.id);
    if (!step.checkpointIds.length) void writeCheckpoints(set.id, step.id);
    if (next && !next.explanations.length) void teachStep(set.id, next.id);
    if (next && !next.checkpointIds.length) void writeCheckpoints(set.id, next.id);
  }, [set.id, step, next]);

  // A missed checkpoint starts the re-explanation right away; it shows once the student moves past the feedback.
  useEffect(() => {
    if (reteach && !teach.running && !teach.error) void teachStep(set.id, step.id, retry ?? undefined);
  }, [reteach, teach.running, teach.error, set.id, step.id, retry]);

  function graded(item: Item, verdict: Parameters<typeof afterCheckpoint>[1], confidence: Parameters<typeof recordAnswer>[3], response: string) {
    recordAnswer(set.id, item.id, verdict, confidence);
    setShownId(item.id);
    if (verdict !== "right") setRetry({ prompt: item.prompt, response, answer: item.answer });
    saveStep(set.id, step.id, (st) => afterCheckpoint(st, verdict));
  }

  function afterCheckpointNext() {
    setShownId(null);
    if (step.status !== "todo") return onDone();
    setScreen({ kind: "beats", round: step.tries, index: 0 });
  }

  const header = (
    <div className="step-head">
      <span className="step-eyebrow num">Step {index + 1} of {total}</span>
      <span className="step-name">{step.title}</span>
    </div>
  );

  if (screen.kind === "intro") {
    const done = step.status !== "todo";
    return (
      <div className="step-screen fade-in">
        <div className="step-intro">
          <span className="step-badge num">{index + 1}</span>
          <h2 className="step-title">{step.title}</h2>
          {step.goal && <p className="step-goal">{step.goal}</p>}
          <div className="row" style={{ justifyContent: "center" }}>
            {step.familiarity && <span className="chip">{FAMILIARITY_LABEL[step.familiarity]}</span>}
            {step.status === "done" && <span className="chip chip-accent">Done</span>}
            {step.status === "review" && <span className="chip">Marked for review</span>}
          </div>
        </div>
        <div className="step-actions">
          {done ? (
            <>
              <button className="btn btn-ghost" onClick={() => setScreen({ kind: "beats", round: 0, index: 0 })}>Read it again</button>
              <button className="btn btn-primary" onClick={onDone}>{index + 1 < total ? "Next step" : "Finish"} <Icon name="arrowRight" size={18} /></button>
            </>
          ) : step.familiarity === "known" ? (
            <>
              <button className="btn btn-ghost" onClick={() => setScreen({ kind: "check" })}>Skip to the checkpoint</button>
              <button className="btn btn-primary" onClick={() => setScreen({ kind: "beats", round: 0, index: 0 })}>Quick recap <Icon name="arrowRight" size={18} /></button>
            </>
          ) : (
            <button className="btn btn-primary btn-lg" onClick={() => setScreen({ kind: "beats", round: 0, index: 0 })}>Start <Icon name="arrowRight" size={18} /></button>
          )}
        </div>
      </div>
    );
  }

  if (screen.kind === "beats") {
    const text = step.explanations[screen.round] ?? "";
    // Still being written: a round that hasn't started yet, or the latest round while the teach job runs.
    const notStarted = screen.round >= step.explanations.length && !teach.error;
    const writing = notStarted || (teach.running && screen.round >= step.explanations.length - 1);
    const beats = parseBeats(text, !writing);
    const beat = beats[screen.index];
    const isLast = !writing && screen.index >= beats.length - 1;
    const dots = Math.max(beats.length, screen.index + 1) + (writing ? 1 : 0);
    return (
      <div className="step-screen">
        {header}
        {screen.round > 0 && screen.index === 0 && <p className="step-note">Let&apos;s look at it another way.</p>}
        {beat ? (
          <div key={`${screen.round}-${screen.index}`} className="beat-enter"><BeatCard beat={beat} onCite={onCite} /></div>
        ) : teach.error && !writing ? (
          <div className="card stack">
            <p className="notice notice-bad">{teach.error}</p>
            <div className="row">
              <button className="btn btn-sm" onClick={() => void teachStep(set.id, step.id, screen.round > 0 ? retry ?? undefined : undefined)}>Try again</button>
              <button className="btn btn-sm btn-ghost" onClick={() => setScreen({ kind: "check" })}>Go to the checkpoint</button>
            </div>
          </div>
        ) : (
          <div className="beat beat-loading" aria-busy>
            <div className="beat-head"><span className="beat-icon"><Icon name="spark" /></span><span className="beat-label pulse">{screen.round > 0 ? "Finding another way to explain it" : "Writing this part"}</span></div>
            <div className="skeleton" style={{ width: "90%", height: 16 }} />
            <div className="skeleton" style={{ width: "75%", height: 16 }} />
            <div className="skeleton" style={{ width: "60%", height: 16 }} />
          </div>
        )}
        <div className="step-nav">
          <button className="btn btn-ghost" onClick={() => setScreen(screen.index > 0 ? { ...screen, index: screen.index - 1 } : screen.round > 0 ? { kind: "check" } : { kind: "intro" })}>
            <Icon name="arrowLeft" size={18} /> Back
          </button>
          <div className="beat-dots" aria-label={`Part ${screen.index + 1} of ${dots}`}>
            {Array.from({ length: dots }, (_, i) => <span key={i} className={i === screen.index ? "is-on" : i < screen.index ? "is-past" : ""} />)}
          </div>
          {isLast ? (
            <button className="btn btn-primary" onClick={() => setScreen({ kind: "check" })}>Check yourself <Icon name="arrowRight" size={18} /></button>
          ) : (
            <button className="btn btn-primary" disabled={!beats[screen.index + 1] && !beat} onClick={() => setScreen({ ...screen, index: screen.index + 1 })}>
              Continue <Icon name="arrowRight" size={18} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="step-screen">
      {header}
      <div className="step-check-intro">
        <span className="beat-icon"><Icon name="flag" /></span>
        <span>{step.tries > 0 && !shownId ? "Try this one." : "Quick check before you move on."}</span>
      </div>
      {checkpoint ? (
        <QuestionCard
          key={checkpoint.id}
          item={checkpoint}
          sourceLabel={set.sections.find((s) => s.id === checkpoint.section)?.title ?? "Your notes"}
          onGraded={(v, c, r) => graded(checkpoint, v, c, r)}
          onNext={afterCheckpointNext}
          onCite={onCite}
          onAskTutor={onAskTutor}
          active={active}
        />
      ) : check.running ? (
        <div className="beat beat-loading" aria-busy>
          <div className="beat-head"><span className="beat-icon"><Icon name="spark" /></span><span className="beat-label pulse">Writing a checkpoint question</span></div>
          <div className="skeleton" style={{ width: "70%", height: 18 }} />
          <div className="skeleton" style={{ height: 52 }} />
        </div>
      ) : (
        <div className="card stack">
          <p className="muted">{check.error ? "Mullwell couldn't write a checkpoint for this step." : "That was the last checkpoint for this step."}</p>
          <div className="row">
            <button className="btn btn-primary btn-sm" onClick={() => void writeCheckpoints(set.id, step.id)}>Try writing one again</button>
            <button className="btn btn-sm btn-ghost" onClick={() => (saveStep(set.id, step.id, (st) => ({ ...st, status: "done" })), onDone())}>Move on</button>
          </div>
        </div>
      )}
      {step.status === "review" && shownId && <p className="step-note">No problem. This step goes on your review list so it comes back soon.</p>}
      {!shownId && (
        <div className="step-nav">
          <button className="btn btn-ghost" onClick={() => setScreen({ kind: "beats", round: Math.max(0, Math.min(step.tries, step.explanations.length - 1)), index: 0 })}>
            <Icon name="arrowLeft" size={18} /> Back to the lesson
          </button>
        </div>
      )}
    </div>
  );
}
