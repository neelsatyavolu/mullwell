"use client";
import { useState } from "react";
import { Icon } from "../Icon";
import { gradeResponse, VerdictStrip } from "../QuestionCard";
import { saveStep } from "@/lib/client/jobs";
import { recordAnswer, updateSet } from "@/lib/client/store";
import { familiarityFrom } from "@/lib/study/lesson";
import type { Item, Lesson, StudySet, Verdict } from "@/lib/study/types";

// Before teaching: one quick question per step to find out what the student
// already knows. "I don't know yet" is a first-class answer.

const LETTERS = "ABCDEF";

/** Ends the gauge: unanswered steps count as new, and teaching starts at the first step. */
export function finishGauge(set: StudySet, lesson: Lesson) {
  updateSet(set.id, (s) => ({
    ...s,
    lesson: { ...lesson, phase: "learn", current: 0, steps: (s.lesson ?? lesson).steps.map((st) => ({ ...st, familiarity: st.familiarity ?? "new" })) },
  }));
}

export function Gauge({ set, lesson }: { set: StudySet; lesson: Lesson }) {
  const probes = lesson.steps
    .map((step) => ({ step, item: set.items.find((i) => i.id === step.probeId) }))
    .filter((p): p is { step: typeof p.step; item: Item } => Boolean(p.item) && p.item!.status !== "dropped");
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [guessing, setGuessing] = useState(false);
  const [result, setResult] = useState<Verdict | "unknown" | null>(null);
  const [busy, setBusy] = useState(false);

  if (!probes.length) {
    return (
      <div className="step-screen fade-in">
        <div className="step-intro">
          <span className="finish-mark"><Icon name="idea" size={28} /></span>
          <h2 className="step-title">Your lesson is ready</h2>
          <p className="step-goal">{lesson.steps.length} short steps, each ending with a quick checkpoint.</p>
        </div>
        <div className="step-actions"><button className="btn btn-primary btn-lg" onClick={() => finishGauge(set, lesson)}>Start learning <Icon name="arrowRight" size={18} /></button></div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="step-screen fade-in">
        <div className="step-intro">
          <span className="finish-mark"><Icon name="flag" size={26} /></span>
          <p className="step-eyebrow">Before we start</p>
          <h2 className="step-title">Let&apos;s see what you already know</h2>
          <p className="step-goal">
            {probes.length} quick {probes.length === 1 ? "question" : "questions"}, about a minute. Then the lesson spends its time on what&apos;s new to you. &ldquo;I don&apos;t know yet&rdquo; is a perfectly good answer.
          </p>
        </div>
        <ol className="plan-list">
          {lesson.steps.map((s, i) => (
            <li key={s.id}><span className="plan-num num">{i + 1}</span><span>{s.title}</span></li>
          ))}
        </ol>
        <div className="step-actions">
          <button className="btn btn-ghost" onClick={() => finishGauge(set, lesson)}>Skip it, teach me everything</button>
          <button className="btn btn-primary btn-lg" onClick={() => setStarted(true)}>Start the quick check <Icon name="arrowRight" size={18} /></button>
        </div>
      </div>
    );
  }

  const { step, item } = probes[index];
  const answered = item.kind === "mcq" ? choice !== null : text.trim().length > 0;
  const last = index === probes.length - 1;

  function settle(verdict: Verdict | "unknown") {
    setResult(verdict);
    saveStep(set.id, step.id, (st) => ({ ...st, familiarity: familiarityFrom(verdict, guessing ? "guess" : "sure") }));
    if (verdict !== "unknown") recordAnswer(set.id, item.id, verdict, guessing ? "guess" : "sure");
  }

  async function check() {
    if (!answered || busy) return;
    setBusy(true);
    const graded = await gradeResponse(item, item.kind === "mcq" ? (choice as number) : text).catch(() => null);
    setBusy(false);
    settle(graded?.verdict ?? "unknown");
  }

  function next() {
    if (last) return finishGauge(set, lesson);
    setIndex((i) => i + 1);
    setChoice(null);
    setText("");
    setGuessing(false);
    setResult(null);
  }

  return (
    <div className="step-screen">
      <div className="step-head">
        <span className="step-eyebrow num">Quick check · {index + 1} of {probes.length}</span>
        <div className="beat-dots" aria-hidden>
          {probes.map((p, i) => <span key={p.item.id} className={i === index ? "is-on" : i < index ? "is-past" : ""} />)}
        </div>
      </div>
      <article className="card stack fade-in" key={item.id}>
        <h2 className="question">{item.prompt}</h2>
        {item.kind === "mcq" ? (
          <div className="choices">
            {item.choices?.map((c, i) => {
              const state = result && result !== "unknown" ? (i === item.correct ? " is-right" : i === choice ? " is-wrong" : "") : "";
              return (
                <button key={i} type="button" className={`choice${state}`} aria-pressed={choice === i} disabled={result !== null} onClick={() => setChoice(i)}>
                  <span className="choice-key">{LETTERS[i]}</span><span>{c}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <textarea className="textarea" rows={2} style={{ minHeight: 72 }} value={text} disabled={result !== null} onChange={(e) => setText(e.target.value)} placeholder="Your best answer, in a sentence" aria-label="Your answer" />
        )}
        {result === null ? (
          <div className="spread">
            <button type="button" className="pill" aria-pressed={guessing} onClick={() => setGuessing((g) => !g)}>I&apos;m guessing</button>
            <div className="row">
              <button className="btn btn-ghost" onClick={() => settle("unknown")}>I don&apos;t know yet</button>
              <button className="btn btn-primary" disabled={!answered || busy || item.status === "checking"} onClick={() => void check()}>
                {busy ? "Checking…" : item.status === "checking" ? "Checking answer key…" : "Check"}
              </button>
            </div>
          </div>
        ) : (
          <div className="stack">
            {result === "unknown" ? (
              <p className="muted">No problem. This is what the lesson is for.</p>
            ) : (
              <VerdictStrip verdict={result}>
                <p>{result === "right" ? (guessing ? "Right, though you were guessing, so we'll go over it." : "You know this one. We'll keep it to a quick recap.") : `The answer is “${item.answer}”. We'll cover it.`}</p>
              </VerdictStrip>
            )}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-primary" autoFocus onClick={next}>{last ? "See my lesson" : "Next"}</button>
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
