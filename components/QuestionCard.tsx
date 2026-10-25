"use client";
import { useEffect, useRef, useState } from "react";
import { runTask } from "@/lib/client/ai";
import { firstObject } from "@/lib/study/ndjson";
import { gradeLocally } from "@/lib/study/grade";
import type { Confidence, Item, Verdict } from "@/lib/study/types";

// One practice question: answer, say how sure you are, check, then see the
// verdict next to the quote from your own material. Misses get an
// "explain it back" step.

export type Graded = { verdict: Verdict; feedback: string; missing: string };

const CONFIDENCE: { id: Confidence; label: string }[] = [
  { id: "guess", label: "Guessing" },
  { id: "unsure", label: "Unsure" },
  { id: "sure", label: "Sure" },
];
const VERDICT_TEXT: Record<Verdict, string> = { right: "Right", partly: "Partly right", wrong: "Not quite" };
const VERDICTS = new Set<Verdict>(["right", "partly", "wrong"]);
const LETTERS = "ABCDEF";

export async function gradeWithModel(item: Item, response: string, mode: "answer" | "explain"): Promise<Graded | null> {
  const { text } = await runTask("grade", { mode, prompt: item.prompt, answer: item.answer, quote: item.quote, response });
  const obj = firstObject(text);
  if (!obj || !VERDICTS.has(obj.verdict as Verdict)) return null;
  return { verdict: obj.verdict as Verdict, feedback: String(obj.feedback ?? ""), missing: String(obj.missing ?? "") };
}

/** Grades locally when possible, else asks the model. Null when the model grader failed. */
export async function gradeResponse(item: Item, response: string | number): Promise<Graded | null> {
  const local = gradeLocally(item, response);
  if (local) {
    const feedback = local === "right" ? "" : `The answer is “${item.answer}”.`;
    return { verdict: local, feedback, missing: "" };
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

export function VerdictStrip({ verdict, children }: { verdict: Verdict; children?: React.ReactNode }) {
  const icon = verdict === "right" ? "✓" : verdict === "partly" ? "≈" : "✕";
  return (
    <div className={`verdict verdict-${verdict} fade-in`} role="status">
      <span aria-hidden style={{ fontWeight: 700 }}>{icon}</span>
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
  onGraded: (verdict: Verdict, confidence: Confidence, response: string) => void;
  onNext: () => void;
  onCite?: (section: number) => void;
  onAskTutor?: (item: Item) => void;
  active?: boolean;
};

export function QuestionCard({ item, sourceLabel, onGraded, onNext, onCite, onAskTutor, active = true }: Props) {
  const [response, setResponse] = useState("");
  const [choice, setChoice] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [phase, setPhase] = useState<"answering" | "grading" | "graded" | "self">("answering");
  const [result, setResult] = useState<Graded | null>(null);
  const [explain, setExplain] = useState("");
  const [explainResult, setExplainResult] = useState<Graded | null | "grading">(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  // Set synchronously so a double click can't grade (and reschedule) twice.
  const checkingRef = useRef(false);
  const checking = item.status === "checking";
  const answered = item.kind === "mcq" ? choice !== null : response.trim().length > 0;
  const canCheck = answered && confidence !== null && !checking && phase === "answering";

  useEffect(() => {
    if (phase === "graded") nextRef.current?.focus();
  }, [phase]);

  // 1–4 picks a choice, Enter checks, when not typing in a box.
  useEffect(() => {
    if (item.kind !== "mcq" || phase !== "answering" || !active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "INPUT") return;
      const n = Number(e.key) - 1;
      if (n >= 0 && n < (item.choices?.length ?? 0)) setChoice(n);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, phase, active]);

  function finish(graded: Graded) {
    setResult(graded);
    setPhase("graded");
    onGraded(graded.verdict, confidence ?? "unsure", item.kind === "mcq" ? (item.choices?.[choice ?? -1] ?? "") : response);
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
    setExplainResult(await gradeWithModel(item, explain, "explain").catch(() => null));
  }

  const done = phase === "graded" || phase === "self";

  return (
    <article className="card stack fade-in" aria-live="polite">
      <div className="row small faint">
        <span className="chip">{item.kind === "mcq" ? "Multiple choice" : item.kind === "cloze" ? "Fill the blank" : "Short answer"}</span>
        {item.concept && <span>{item.concept}</span>}
      </div>
      <h2 className="question">{item.prompt}</h2>

      {item.kind === "mcq" ? (
        <div className="choices" role="group" aria-label="Choices">
          {item.choices?.map((c, i) => {
            const state = done && result ? (i === item.correct ? " is-right" : i === choice ? " is-wrong" : "") : "";
            return (
              <button key={i} type="button" className={`choice${state}`} aria-pressed={choice === i} disabled={phase !== "answering"} onClick={() => setChoice(i)}>
                <span className="choice-key">{LETTERS[i]}</span>
                <span>{c}</span>
              </button>
            );
          })}
        </div>
      ) : item.kind === "cloze" ? (
        <input
          className="input"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          disabled={phase !== "answering"}
          placeholder="The missing word or phrase"
          aria-label="Your answer"
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void check())}
        />
      ) : (
        <textarea
          className="textarea"
          rows={3}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          disabled={phase !== "answering"}
          placeholder="Answer in your own words. A sentence or two is enough."
          aria-label="Your answer"
          onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && (e.preventDefault(), void check())}
        />
      )}

      {phase === "answering" || phase === "grading" ? (
        <div className="spread">
          <div className="pills" role="group" aria-label="How sure are you?">
            {CONFIDENCE.map((c) => (
              <button key={c.id} type="button" className="pill" aria-pressed={confidence === c.id} onClick={() => setConfidence(c.id)} disabled={phase !== "answering"}>
                {c.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" disabled={!canCheck} onClick={() => void check()}>
            {phase === "grading" ? "Checking…" : checking ? "Checking answer key…" : "Check"}
          </button>
        </div>
      ) : null}
      {phase === "answering" && answered && !confidence && <p className="small faint">Pick how sure you are first. It decides when this comes back.</p>}
      {phase === "answering" && item.unchecked && <p className="small faint">Heads up: this answer key couldn&apos;t be double-checked.</p>}

      {phase === "self" && (
        <div className="stack fade-in">
          <p className="notice">Couldn&apos;t reach the grader. Compare with the answer and mark yourself.</p>
          <div className="inset"><strong>Answer:</strong> {item.answer}</div>
          <SourceQuote item={item} label={sourceLabel} onCite={onCite} />
          <div className="pills">
            {(["right", "partly", "wrong"] as Verdict[]).map((v) => (
              <button key={v} type="button" className="pill" onClick={() => finish({ verdict: v, feedback: "", missing: "" })}>
                {VERDICT_TEXT[v]}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === "graded" && result && (
        <div className="stack">
          <VerdictStrip verdict={result.verdict}>{result.feedback && <p>{result.feedback}</p>}</VerdictStrip>
          {item.kind !== "mcq" && result.verdict !== "right" && (
            <div className="inset small"><strong>Model answer:</strong> {item.answer}</div>
          )}
          <SourceQuote item={item} label={sourceLabel} onCite={onCite} />
          {item.explain && <p className="muted">{item.explain}</p>}
          {item.unchecked && <p className="small faint">This answer key wasn&apos;t double-checked (the check couldn&apos;t run).</p>}

          {result.verdict !== "right" && (
            <div className="stack inset" style={{ gap: 10 }}>
              <label className="field">
                <span>Explain it back in your own words. It&apos;s the fastest way to make it stick.</span>
                <textarea className="textarea" rows={2} style={{ minHeight: 64 }} value={explain} onChange={(e) => setExplain(e.target.value)} disabled={explainResult !== null && explainResult !== "grading" && explainResult.verdict === "right"} />
              </label>
              <div className="row">
                <button type="button" className="btn btn-sm" disabled={!explain.trim() || explainResult === "grading"} onClick={() => void checkExplanation()}>
                  {explainResult === "grading" ? "Reading…" : "Check my explanation"}
                </button>
                {onAskTutor && <button type="button" className="btn btn-sm btn-ghost" onClick={() => onAskTutor(item)}>Talk it through with the tutor</button>}
              </div>
              {explainResult && explainResult !== "grading" && <VerdictStrip verdict={explainResult.verdict}><p>{explainResult.feedback}</p></VerdictStrip>}
            </div>
          )}
        </div>
      )}

      {done && phase === "graded" && (
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button ref={nextRef} type="button" className="btn btn-primary" onClick={onNext}>Next</button>
        </div>
      )}
    </article>
  );
}
