"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { confirmDialog } from "./Dialog";
import { MissedBySet } from "./MissedBySet";
import { CONFIDENCE, gradeResponse, SourceQuote, VerdictStrip, type Graded } from "./QuestionCard";
import { TestNavigator } from "./TestNavigator";
import { attemptCounts } from "@/lib/client/derived";
import { clearSession, testDraftKey, writeSession } from "@/lib/client/session";
import { MAX_RESPONSE, recordAnswer, saveRun, useLibrary } from "@/lib/client/store";
import { missedConcepts, type ExamItem } from "@/lib/study/exam";
import { newId } from "@/lib/study/ids";
import { answeredCount, type TestDraft } from "@/lib/study/run";
import { choiceOrder, seedFor } from "@/lib/study/shuffle";
import type { Confidence, RunResult } from "@/lib/study/types";

// A practice test: every question answered with no feedback until the end,
// like the real thing. Then it's graded, recorded and summarised. Answers are
// kept in this tab as they're given, so a refresh or a quit doesn't lose them.

const GRADE_CONCURRENCY = 3;
const LETTERS = "ABCDEF";

async function mapLimit<T, R>(list: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i], i);
    }
  }));
  return out;
}

type Props = {
  examId: string;
  items: ExamItem[];
  /** A saved sitting to pick up again. */
  draft?: TestDraft | null;
  onClose: () => void;
  /** Practise the questions that were missed. */
  onStudy: (items: ExamItem[]) => void;
};

export function PracticeTest({ examId, items, draft, onClose, onStudy }: Props) {
  const { library } = useLibrary();
  // Shuffled choice order per question (`order[displayPosition]` is the stored index), fixed for this sitting.
  const [orders] = useState(() => {
    const counts = attemptCounts(library);
    return new Map(items.map((i) => [i.id, choiceOrder(i, seedFor(i.id, counts.get(i.id) ?? 0))]));
  });
  /** Stored choice index (as a string) for multiple choice, else the typed answer. */
  const [answers, setAnswers] = useState<Record<string, string>>(() => draft?.answers ?? {});
  const [confidences, setConfidences] = useState<Record<string, Confidence>>(() => draft?.confidences ?? {});
  const [phase, setPhase] = useState<"taking" | "grading" | "done">("taking");
  /** undefined while a question waits to be graded, null when grading failed. */
  const [graded, setGraded] = useState<(Graded | null | undefined)[]>([]);
  const [gradedCount, setGradedCount] = useState(0);
  const [results, setResults] = useState<RunResult[]>([]);
  const [onlyMisses, setOnlyMisses] = useState(false);
  const [started] = useState(() => draft?.started ?? Date.now());
  const [minutes, setMinutes] = useState(0);
  const submitting = useRef(false);
  const ids = items.map((i) => i.id);
  const key = testDraftKey(examId);
  const answeredNow = answeredCount(ids, answers);
  const unanswered = items.length - answeredNow;

  // Keep the sitting in this tab while it's being taken; nothing worth keeping means no draft.
  useEffect(() => {
    if (phase !== "taking") return;
    const itemIds = items.map((i) => i.id);
    if (answeredCount(itemIds, answers) || Object.keys(confidences).length) writeSession(key, { itemIds, answers, confidences, started } satisfies TestDraft);
    else clearSession(key);
  }, [phase, key, items, answers, confidences, started]);

  async function quit() {
    if (answeredNow) {
      const ok = await confirmDialog({
        title: "Leave the test?",
        body: "Your answers stay saved in this tab, so you can pick up where you left off.",
        confirmLabel: "Leave",
      });
      if (!ok) return;
    }
    onClose();
  }

  async function submit() {
    if (submitting.current) return;
    if (unanswered) {
      const ok = await confirmDialog({
        title: `${unanswered} ${unanswered === 1 ? "question is" : "questions are"} blank`,
        body: "Blank answers count as misses. You can go back and answer them first.",
        confirmLabel: "Submit anyway",
      });
      if (!ok || submitting.current) return;
    }
    submitting.current = true;
    setPhase("grading");
    const out = await mapLimit(items, GRADE_CONCURRENCY, async (item, i) => {
      const a = (answers[item.id] ?? "").trim();
      const r: Graded | null = a
        ? await gradeResponse(item, item.kind === "mcq" ? Number(a) : a).catch(() => null)
        : { verdict: "wrong", feedback: "Left blank.", missing: "", source: "local" };
      // Each verdict shows on its card as soon as it's in.
      setGraded((g) => Object.assign([...g], { [i]: r }));
      setGradedCount((c) => c + 1);
      return r;
    });
    const now = Date.now();
    const took = Math.max(1, Math.round((now - started) / 60_000));
    const responseOf = (item: ExamItem) => (item.kind === "mcq" ? item.choices?.[Number(answers[item.id])] : answers[item.id])?.trim().slice(0, MAX_RESPONSE) || undefined;
    out.forEach((r, i) => {
      if (!r) return;
      const item = items[i];
      recordAnswer(item.setId, item.id, r.verdict, confidences[item.id] ?? "unsure", { mode: "test", response: responseOf(item), feedback: r.feedback, missing: r.missing, source: r.source }, now + i);
    });
    // Questions the grader couldn't reach don't count either way.
    const scored = out.flatMap((r, i) => (r ? [{ item: items[i], verdict: r.verdict, feedback: r.feedback }] : []));
    const runResults: RunResult[] = scored.map((s) => ({ itemId: s.item.id, setId: s.item.setId, verdict: s.verdict, response: responseOf(s.item), feedback: s.feedback || undefined }));
    saveRun({
      id: newId("r"),
      examId,
      at: now,
      total: scored.length,
      right: scored.filter((s) => s.verdict === "right").length,
      partly: scored.filter((s) => s.verdict === "partly").length,
      missed: missedConcepts(scored).slice(0, 12),
      results: runResults,
      minutes: took,
    });
    clearSession(key);
    setMinutes(took);
    setResults(runResults);
    setPhase("done");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const right = graded.filter((g) => g?.verdict === "right").length;
  const partly = graded.filter((g) => g?.verdict === "partly").length;
  const failed = graded.filter((g) => g === null).length;
  const missedItems = items.filter((_, n) => graded[n] && graded[n].verdict !== "right");
  const label = (i: ExamItem) => library.sets[i.setId]?.sections.find((s) => s.id === i.section)?.title ?? "Your notes";

  return (
    <div className="stack">
      {phase === "done" ? (
        <div className="card stack fade-in">
          <p className="label">Practice test</p>
          <h2 className="title num">{right} of {items.length - failed} right{partly ? `, ${partly} partly` : ""}</h2>
          <p className="muted num">Took about {minutes} min. Missed questions are scheduled to come back soon.{failed ? ` ${failed} couldn't be graded.` : ""}</p>
          <MissedBySet results={results} />
          <div className="row">
            {missedItems.length ? (
              <>
                <button className="btn btn-primary" onClick={() => onStudy(missedItems)}>Study what you missed</button>
                <button className="btn" onClick={onClose}>Back to the test plan</button>
              </>
            ) : (
              <button className="btn btn-primary" onClick={onClose}>Back to the test plan</button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="spread">
            <p className="muted small num">{items.length} questions · no feedback until you submit</p>
            <button className="btn btn-ghost btn-sm" disabled={phase === "grading"} onClick={() => void quit()}>Quit</button>
          </div>
          <TestNavigator answered={items.map((i) => Boolean((answers[i.id] ?? "").trim()))} started={started} running={phase === "taking"} />
        </>
      )}
      {phase === "done" && missedItems.length > 0 && missedItems.length < items.length - failed && (
        <div className="modes" role="group" aria-label="Which questions to show">
          <button type="button" className="mode" aria-pressed={!onlyMisses} onClick={() => setOnlyMisses(false)}>All</button>
          <button type="button" className="mode" aria-pressed={onlyMisses} onClick={() => setOnlyMisses(true)}>Only misses</button>
        </div>
      )}
      {items.map((item, n) => {
        const g = graded[n];
        if (phase === "done" && onlyMisses && !(g && g.verdict !== "right")) return null;
        const a = answers[item.id] ?? "";
        const set = library.sets[item.setId];
        const setAnswer = (value: string) => setAnswers((x) => ({ ...x, [item.id]: value }));
        return (
          <article key={item.id} id={`q-${n + 1}`} tabIndex={-1} className="card stack test-q">
            <div className="spread small faint"><span className="num">Question {n + 1}</span>{set && <Link href={`/set/${set.id}`} className="faint">{set.title}</Link>}</div>
            <h3 className="question" style={{ fontSize: 18, lineHeight: "28px" }}>{item.prompt}</h3>
            {item.kind === "mcq" ? (
              <div className="choices">
                {(orders.get(item.id) ?? item.choices?.map((_, i) => i) ?? []).map((i, pos) => {
                  const state = g ? (i === item.correct ? " is-right" : String(i) === a ? " is-wrong" : "") : "";
                  return (
                    <button key={i} type="button" className={`choice${state}`} aria-pressed={a === String(i)} disabled={phase !== "taking"} onClick={() => setAnswer(String(i))}>
                      <span className="choice-key">{LETTERS[pos]}</span><span>{item.choices?.[i]}</span>
                    </button>
                  );
                })}
              </div>
            ) : item.kind === "cloze" ? (
              <input className="input" value={a} disabled={phase !== "taking"} onChange={(e) => setAnswer(e.target.value)} placeholder="The missing word or phrase" aria-label={`Answer to question ${n + 1}`} />
            ) : (
              <textarea className="textarea" rows={3} style={{ minHeight: 96 }} value={a} disabled={phase !== "taking"} onChange={(e) => setAnswer(e.target.value)} aria-label={`Answer to question ${n + 1}`} />
            )}
            {phase === "taking" && (
              <div className="pills" role="group" aria-label={`How sure are you about question ${n + 1}? (optional)`}>
                {CONFIDENCE.map((c) => (
                  <button key={c.id} type="button" className="pill pill-sm" aria-pressed={confidences[item.id] === c.id} onClick={() => setConfidences((x) => ({ ...x, [item.id]: c.id }))}>{c.label}</button>
                ))}
              </div>
            )}
            {g !== undefined && (g ? (
              <div className="stack fade-in">
                <VerdictStrip verdict={g.verdict}>{g.feedback && <p>{g.feedback}</p>}</VerdictStrip>
                {item.kind !== "mcq" && g.verdict !== "right" && <div className="inset small"><strong>Model answer:</strong> {item.answer}</div>}
                <SourceQuote item={item} label={label(item)} />
              </div>
            ) : (
              <p className="notice">Couldn&apos;t grade this one. Model answer: {item.answer}</p>
            ))}
          </article>
        );
      })}
      {phase === "grading" && (
        <div className="stack" style={{ gap: 8 }} role="status">
          <p className="small muted num">Grading {gradedCount} of {items.length}…</p>
          <div className="progress"><span style={{ width: `${(gradedCount / Math.max(1, items.length)) * 100}%` }} /></div>
        </div>
      )}
      {phase === "taking" && (
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={() => void submit()}>Submit test</button>
        </div>
      )}
    </div>
  );
}
