"use client";
import { useEffect, useRef, useState } from "react";
import { editQuestionAnswer, reportQuestion, restoreQuestion } from "./FixQuestion";
import { runTask } from "@/lib/client/ai";
import { attemptCounts } from "@/lib/client/derived";
import { getLibrary } from "@/lib/client/store";
import { firstObject } from "@/lib/study/ndjson";
import { gradeLocally } from "@/lib/study/grade";
import { keyToAction, type KeyTarget } from "@/lib/study/keys";
import { choiceOrder, seedFor } from "@/lib/study/shuffle";
import type { AttemptSource, Confidence, Item, Verdict } from "@/lib/study/types";

// One practice question: answer, say how sure you are, check, then see the
// verdict next to the quote from your own material. Misses get an
// "explain it back" step. The whole round works from the keyboard.
// Multiple-choice options are shuffled each time a question is shown, so the
// student learns the idea rather than its letter. After grading, the student
// can overrule an unfair grade, report a broken question or fix a short answer.

export type Graded = { verdict: Verdict; feedback: string; missing: string; source?: AttemptSource };

export const CONFIDENCE: { id: Confidence; label: string }[] = [
  { id: "guess", label: "Guessing" },
  { id: "unsure", label: "Unsure" },
  { id: "sure", label: "Sure" },
];
export const VERDICT_TEXT: Record<Verdict, string> = { right: "Right", partly: "Partly right", wrong: "Not quite" };
const VERDICTS = new Set<Verdict>(["right", "partly", "wrong"]);
const LETTERS = "ABCDEF";

export async function gradeWithModel(item: Item, response: string, mode: "answer" | "explain"): Promise<Graded | null> {
  const { text } = await runTask("grade", { mode, prompt: item.prompt, answer: item.answer, quote: item.quote, response });
  const obj = firstObject(text);
  if (!obj || !VERDICTS.has(obj.verdict as Verdict)) return null;
  return { verdict: obj.verdict as Verdict, feedback: String(obj.feedback ?? ""), missing: String(obj.missing ?? ""), source: "model" };
}

/** Grades locally when possible, else asks the model. Null when the model grader failed. */
export async function gradeResponse(item: Item, response: string | number): Promise<Graded | null> {
  const local = gradeLocally(item, response);
  if (local) {
    const feedback = local === "right" ? "" : `The answer is “${item.answer}”.`;
    return { verdict: local, feedback, missing: "", source: "local" };
  }
  return gradeWithModel(item, String(response), "answer");
}

export function SourceQuote({ item, label, onCite }: { item: Item; label: string; onCite?: (section: number) => void }) {
  return (
    <blockquote className="quote">
      <span className="quote-label">
        {onCite ? (
          <button type="button" className="cite" onClick={() => onCite(item.section)}>§{item.section}</button>
        ) : (
          <span className="cite">§{item.section}</span>
        )}{" "}
        {label}
      </span>
      “{item.quote}”
    </blockquote>
  );
}

/** Where a key press landed, for the keyboard flow. A selected choice or pill counts as the page, so Enter checks from it. */
function keyTarget(el: HTMLElement): KeyTarget {
  if (el.tagName === "INPUT") return "input";
  if (el.tagName === "TEXTAREA") return "textarea";
  if (["BUTTON", "A", "SELECT"].includes(el.tagName) && el.getAttribute("aria-pressed") !== "true") return "button";
  return "page";
}

export function VerdictStrip({ verdict, children }: { verdict: Verdict; children?: React.ReactNode }) {
  const icon = verdict === "right" ? "✓" : verdict === "partly" ? "≈" : "✕";
  return (
    <div className={`verdict verdict-${verdict} fade-in`} role="status">
      <span aria-hidden className="verdict-icon">{icon}</span>
      <div className="stack" style={{ gap: 4 }}>
        <strong>{VERDICT_TEXT[verdict]}</strong>
        {children}
      </div>
    </div>
  );
}

type Props = {
  item: Item;
  sourceLabel: string;
  /** `response` is what the student answered, as text (the choice's text for multiple choice). */
  onGraded: (verdict: Verdict, confidence: Confidence, response: string, graded: Graded) => void;
  onNext: () => void;
  onCite?: (section: number) => void;
  onAskTutor?: (item: Item) => void;
  active?: boolean;
  /** Offers "I was right" on a miss; the parent replaces the stored grade. */
  onOverride?: () => void;
  /** The question's set: offers Report, and Edit answer on short and fill-the-blank questions. */
  setId?: string;
};

export function QuestionCard({ item, sourceLabel, onGraded, onNext, onCite, onAskTutor, active = true, onOverride, setId }: Props) {
  const [response, setResponse] = useState("");
  // `order[displayPosition]` is the stored choice index; fixed while this card is up.
  const [order] = useState(() => choiceOrder(item, seedFor(item.id, attemptCounts(getLibrary()).get(item.id) ?? 0)));
  /** The stored index of the chosen option (not its display position). */
  const [choice, setChoice] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [phase, setPhase] = useState<"answering" | "grading" | "graded" | "self">("answering");
  const [result, setResult] = useState<Graded | null>(null);
  const [explain, setExplain] = useState("");
  const [explainResult, setExplainResult] = useState<Graded | null | "grading" | "error">(null);
  // True when the student said "I don't know" instead of answering.
  const [gaveUp, setGaveUp] = useState(false);
  const [overruled, setOverruled] = useState(false);
  const [reported, setReported] = useState(false);
  const [answerSaved, setAnswerSaved] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const answerRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  // Choice buttons by display position, and pills by confidence, so focus can follow a key press.
  const choiceEls = useRef<(HTMLButtonElement | null)[]>([]);
  const pillEls = useRef<Partial<Record<Confidence, HTMLButtonElement | null>>>({});
  // Set synchronously so a double click can't grade (and reschedule) twice.
  const checkingRef = useRef(false);
  const checking = item.status === "checking";
  const answered = item.kind === "mcq" ? choice !== null : response.trim().length > 0;
  // Confidence is optional on multiple choice; finish() falls back to "unsure".
  const canCheck = answered && !checking && phase === "answering" && (item.kind === "mcq" || confidence !== null);

  useEffect(() => {
    if (phase === "graded") nextRef.current?.focus();
  }, [phase]);

  // Put focus where the answer goes, so it doesn't drop to the page after Next.
  // On multiple choice that's the picked option if there is one, so Enter checks it.
  useEffect(() => {
    if (!active) return;
    const picked = choiceEls.current.find((el) => el?.getAttribute("aria-pressed") === "true");
    (item.kind === "mcq" ? (picked ?? choiceEls.current[0]) : answerRef.current)?.focus({ preventScroll: true });
  }, [active, item.kind]);

  // A–F or 1–6 pick a choice, G/U/S set confidence, Enter checks, N moves on.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.isComposing) return;
      const press = { key: e.key, target: keyTarget(e.target as HTMLElement), mod: e.metaKey || e.ctrlKey || e.altKey };
      const action = keyToAction(press, { kind: item.kind, phase, choices: item.choices?.length ?? 0, canCheck });
      if (!action) return;
      e.preventDefault();
      // Focus follows the pick, so the next Enter checks rather than pressing whatever had focus.
      if (action.type === "choose") {
        setChoice(order[action.index] ?? null);
        choiceEls.current[action.index]?.focus({ preventScroll: true });
      } else if (action.type === "confidence") {
        setConfidence(action.confidence);
        pillEls.current[action.confidence]?.focus({ preventScroll: true });
      } else if (action.type === "check") void check();
      else onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function finish(graded: Graded, conf: Confidence = confidence ?? "unsure", answer?: string) {
    setResult(graded);
    setPhase("graded");
    onGraded(graded.verdict, conf, answer ?? (item.kind === "mcq" ? (item.choices?.[choice ?? -1] ?? "") : response), graded);
  }

  /** Shows the answer straight away and logs a miss, so the question comes back soon. No model call. */
  function dontKnow() {
    if (phase !== "answering" || checking || checkingRef.current) return;
    checkingRef.current = true;
    setChoice(null);
    setConfidence("guess");
    setGaveUp(true);
    finish({ verdict: "wrong", feedback: "", missing: "", source: "self" }, "guess", "");
  }

  async function check() {
    if (!canCheck || checkingRef.current) return;
    checkingRef.current = true;
    setPhase("grading");
    const graded = await gradeResponse(item, item.kind === "mcq" ? (choice as number) : response).catch(() => null);
    if (graded) finish(graded);
    else setPhase("self");
  }

  async function checkExplanation() {
    setExplainResult("grading");
    setExplainResult((await gradeWithModel(item, explain, "explain").catch(() => null)) ?? "error");
  }

  const done = phase === "graded" || phase === "self";
  const verdict = overruled ? "right" : result?.verdict;
  // Not after "I don't know" or a self-marked grade: there's no grader to overrule.
  const canOverrule = Boolean(onOverride) && !overruled && result !== null && result.source !== "self" && result.verdict !== "right";

  function overrule() {
    if (!canOverrule) return;
    setOverruled(true);
    onOverride?.();
    // The button goes away; keep focus in the card.
    nextRef.current?.focus();
  }

  async function report() {
    if (setId && (await reportQuestion(setId, item))) {
      setReported(true);
      // After the dialog hands focus back to Report, which is now gone.
      requestAnimationFrame(() => nextRef.current?.focus());
    }
  }

  async function editAnswer() {
    if (setId && (await editQuestionAnswer(setId, item))) setAnswerSaved(true);
  }

  return (
    <article className="card stack fade-in">
      <div className="row small faint">
        <span className="chip">{item.kind === "mcq" ? "Multiple choice" : item.kind === "cloze" ? "Fill the blank" : "Short answer"}</span>
        {item.concept && <span>{item.concept}</span>}
      </div>
      <h2 className="question">{item.prompt}</h2>

      {item.kind === "mcq" ? (
        <div className="choices" role="group" aria-label="Choices">
          {order.map((i, pos) => {
            const state = done && result ? (i === item.correct ? " is-right" : i === choice ? " is-wrong" : "") : "";
            return (
              <button key={i} ref={(el) => { choiceEls.current[pos] = el; }} type="button" className={`choice${state}`} aria-pressed={choice === i} disabled={phase !== "answering"} onClick={() => setChoice(i)}>
                <span className="choice-key">{LETTERS[pos]}</span>
                <span>{item.choices?.[i]}</span>
              </button>
            );
          })}
        </div>
      ) : item.kind === "cloze" ? (
        <input
          ref={answerRef}
          className="input"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          disabled={phase !== "answering"}
          placeholder="The missing word or phrase"
          aria-label="Your answer"
        />
      ) : (
        <textarea
          ref={answerRef}
          className="textarea"
          rows={3}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          disabled={phase !== "answering"}
          placeholder="Answer in your own words. A sentence or two is enough."
          aria-label="Your answer"
        />
      )}

      {phase === "answering" || phase === "grading" ? (
        <div className="spread">
          <div className="row">
            {item.kind === "mcq" && <span className="small muted">How sure? (optional)</span>}
            <div className="pills" role="group" aria-label={item.kind === "mcq" ? "How sure are you? (optional)" : "How sure are you?"}>
              {CONFIDENCE.map((c) => (
                <button key={c.id} ref={(el) => { pillEls.current[c.id] = el; }} type="button" className="pill" aria-pressed={confidence === c.id} onClick={() => setConfidence(c.id)} disabled={phase !== "answering"}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="row">
            <button type="button" className="btn btn-ghost" disabled={phase !== "answering" || checking} onClick={dontKnow}>I don&apos;t know</button>
            <button type="button" className="btn btn-primary" disabled={!canCheck} onClick={() => void check()}>
              {phase === "grading" ? "Checking…" : checking ? "Checking answer key…" : "Check"}
            </button>
          </div>
        </div>
      ) : null}
      {phase === "answering" && <KeyHint kind={item.kind} choices={item.choices?.length ?? 0} />}
      {phase === "answering" && item.kind !== "mcq" && answered && !confidence && <p className="small muted">Pick how sure you are first. It decides when this comes back.</p>}
      {phase === "answering" && item.unchecked && <p className="small faint">Heads up: this answer key couldn&apos;t be double-checked.</p>}

      {phase === "self" && (
        <div className="stack fade-in">
          <p className="notice">Couldn&apos;t reach the grader. Compare with the answer and mark yourself.</p>
          <div className="inset"><strong>Answer:</strong> {item.answer}</div>
          <SourceQuote item={item} label={sourceLabel} onCite={onCite} />
          <div className="pills">
            {(["right", "partly", "wrong"] as Verdict[]).map((v) => (
              <button key={v} type="button" className="pill" onClick={() => finish({ verdict: v, feedback: "", missing: "", source: "self" })}>
                {VERDICT_TEXT[v]}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === "graded" && result && verdict && (
        <div className="stack">
          <VerdictStrip key={verdict} verdict={verdict}>
            {overruled ? <p>Counted as right.</p> : <>
              {result.verdict === "wrong" && confidence === "sure" && <p>You were sure about this one. Read the quote closely; confident mistakes are the easiest to fix once you see why.</p>}
              {gaveUp ? <p>Not yet. Here&apos;s what your notes say.</p> : result.feedback && <p>{result.feedback}</p>}
            </>}
          </VerdictStrip>
          {item.kind !== "mcq" && verdict !== "right" && (
            <div className="inset small"><strong>Model answer:</strong> {item.answer}</div>
          )}
          <SourceQuote item={item} label={sourceLabel} onCite={onCite} />
          {item.explain && <p className="muted">{item.explain}</p>}
          {item.unchecked && <p className="small faint">This answer key wasn&apos;t double-checked (the check couldn&apos;t run).</p>}

          {answerSaved && <p className="small muted" role="status">Answer saved. Later answers are checked against it.</p>}
          {reported && (
            <div className="notice row" style={{ justifyContent: "space-between" }} role="status">
              <span>Removed from practice.</span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => (setId && restoreQuestion(setId, item.id), setReported(false))}>Undo</button>
            </div>
          )}

          {verdict !== "right" && (
            <div className="stack inset" style={{ gap: 10 }}>
              <label className="field">
                <span>Explain it back in your own words. It&apos;s the fastest way to make it stick.</span>
                <textarea className="textarea" rows={2} style={{ minHeight: 64 }} value={explain} onChange={(e) => setExplain(e.target.value)} disabled={typeof explainResult === "object" && explainResult?.verdict === "right"} />
              </label>
              <div className="row">
                <button type="button" className="btn btn-sm" disabled={!explain.trim() || explainResult === "grading"} onClick={() => void checkExplanation()}>
                  {explainResult === "grading" ? "Reading…" : "Check my explanation"}
                </button>
                {onAskTutor && <button type="button" className="btn btn-sm btn-ghost" onClick={() => onAskTutor(item)}>Talk it through with the tutor</button>}
              </div>
              {explainResult === "error" && (
                <div className="row">
                  <p className="notice notice-bad" role="alert">Couldn&apos;t check that just now.</p>
                  <button type="button" className="btn btn-sm" onClick={() => void checkExplanation()}>Try again</button>
                </div>
              )}
              {explainResult && explainResult !== "grading" && explainResult !== "error" && <VerdictStrip verdict={explainResult.verdict}><p>{explainResult.feedback}</p></VerdictStrip>}
            </div>
          )}
        </div>
      )}

      {done && phase === "graded" && (
        <div className="spread">
          <div className="row" style={{ gap: 4 }}>
            {canOverrule && <button type="button" className="btn btn-ghost btn-sm" onClick={overrule}>I was right</button>}
            {setId && item.kind !== "mcq" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void editAnswer()}>Edit answer</button>}
            {setId && !reported && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void report()}>Report</button>}
          </div>
          <button ref={nextRef} type="button" className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={onNext}>Next</button>
        </div>
      )}
    </article>
  );
}

/** One line of keyboard shortcuts, shown on wider screens only. */
function KeyHint({ kind, choices }: { kind: Item["kind"]; choices: number }) {
  const sure = <><span className="kbd">G</span> <span className="kbd">U</span> <span className="kbd">S</span> how sure</>;
  return (
    <p className="small muted kbd-hint">
      {kind === "mcq" ? (
        <><span className="kbd">A</span>–<span className="kbd">{LETTERS[Math.max(0, choices - 1)]}</span> choose · {sure}</>
      ) : (
        <><span className="kbd">Tab</span> then {sure}</>
      )}{" "}
      · <span className="kbd">Enter</span> check
    </p>
  );
}
