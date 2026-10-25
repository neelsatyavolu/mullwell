"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { gradeResponse, SourceQuote, VerdictStrip, type Graded } from "./QuestionCard";
import { recordAnswer, saveRun, useLibrary } from "@/lib/client/store";
import { missedConcepts, type ExamItem } from "@/lib/study/exam";
import { newId } from "@/lib/study/ids";

// A practice test: every question answered with no feedback until the end,
// like the real thing. Then it's graded, recorded and summarised.

const GRADE_CONCURRENCY = 3;
const LETTERS = "ABCDEF";

async function mapLimit<T, R>(list: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i]);
    }
  }));
  return out;
}

export function PracticeTest({ examId, items, onClose }: { examId: string; items: ExamItem[]; onClose: () => void }) {
  const { library } = useLibrary();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"taking" | "grading" | "done">("taking");
  const [graded, setGraded] = useState<(Graded | null)[]>([]);
  const [started] = useState(() => Date.now());
  const [minutes, setMinutes] = useState(0);
  const submitting = useRef(false);
  const unanswered = items.filter((i) => !(answers[i.id] ?? "").trim()).length;

  async function submit() {
    if (submitting.current) return;
    if (unanswered && !confirm(`${unanswered} ${unanswered === 1 ? "question is" : "questions are"} blank. Submit anyway?`)) return;
    submitting.current = true;
    setPhase("grading");
    const results = await mapLimit(items, GRADE_CONCURRENCY, async (item) => {
      const a = (answers[item.id] ?? "").trim();
      if (!a) return { verdict: "wrong" as const, feedback: "Left blank.", missing: "" };
      return gradeResponse(item, item.kind === "mcq" ? Number(a) : a).catch(() => null);
    });
    const now = Date.now();
    setMinutes(Math.max(1, Math.round((now - started) / 60_000)));
    results.forEach((r, i) => r && recordAnswer(items[i].setId, items[i].id, r.verdict, "unsure", now + i));
    // Questions the grader couldn't reach don't count either way.
    const scored = results.flatMap((r, i) => (r ? [{ item: items[i], verdict: r.verdict }] : []));
    saveRun({
      id: newId("r"),
      examId,
      at: now,
      total: scored.length,
      right: scored.filter((s) => s.verdict === "right").length,
      partly: scored.filter((s) => s.verdict === "partly").length,
      missed: missedConcepts(scored).slice(0, 12),
    });
    setGraded(results);
    setPhase("done");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const right = graded.filter((g) => g?.verdict === "right").length;
  const partly = graded.filter((g) => g?.verdict === "partly").length;
  const failed = graded.filter((g) => g === null).length;
  const label = (i: ExamItem) => library.sets[i.setId]?.sections.find((s) => s.id === i.section)?.title ?? "Your notes";

  return (
    <div className="stack">
      {phase === "done" ? (
        <div className="card stack fade-in">
          <p className="label">Practice test</p>
          <h2 className="title num">{right} of {items.length - failed} right{partly ? `, ${partly} partly` : ""}</h2>
          <p className="muted num">Took about {minutes} min. Missed questions are scheduled to come back soon.{failed ? ` ${failed} couldn't be graded.` : ""}</p>
          <div><button className="btn" onClick={onClose}>Back to the test plan</button></div>
        </div>
      ) : (
        <div className="spread">
          <p className="muted small num">{items.length} questions · no feedback until you submit</p>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Quit</button>
        </div>
      )}
      {items.map((item, n) => {
        const g = graded[n];
        const a = answers[item.id] ?? "";
        const set = library.sets[item.setId];
        return (
          <article key={item.id} className="card stack">
            <div className="spread small faint"><span className="num">Question {n + 1}</span>{set && <Link href={`/set/${set.id}`} className="faint">{set.title}</Link>}</div>
            <h3 className="question" style={{ fontSize: 18, lineHeight: "28px" }}>{item.prompt}</h3>
            {item.kind === "mcq" ? (
              <div className="choices">
                {item.choices?.map((c, i) => {
                  const state = phase === "done" ? (i === item.correct ? " is-right" : String(i) === a ? " is-wrong" : "") : "";
                  return (
                    <button key={i} type="button" className={`choice${state}`} aria-pressed={a === String(i)} disabled={phase !== "taking"} onClick={() => setAnswers((x) => ({ ...x, [item.id]: String(i) }))}>
                      <span className="choice-key">{LETTERS[i]}</span><span>{c}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <textarea className="textarea" rows={item.kind === "cloze" ? 1 : 3} style={{ minHeight: item.kind === "cloze" ? 44 : 96 }} value={a} disabled={phase !== "taking"} onChange={(e) => setAnswers((x) => ({ ...x, [item.id]: e.target.value }))} aria-label={`Answer to question ${n + 1}`} />
            )}
            {phase === "done" && (g ? (
              <div className="stack">
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
      {phase !== "done" && (
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-primary" disabled={phase === "grading"} onClick={() => void submit()}>{phase === "grading" ? "Grading…" : "Submit test"}</button>
        </div>
      )}
    </div>
  );
}
