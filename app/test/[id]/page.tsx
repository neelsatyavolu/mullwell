"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ConnectNotice } from "@/components/ConnectNotice";
import { MissedBySet } from "@/components/MissedBySet";
import { confirmDialog } from "@/components/Dialog";
import { dayLabel } from "@/components/Library";
import { Practice, WritingPlaceholder } from "@/components/Practice";
import { PracticeTest } from "@/components/PracticeTest";
import { attemptsList, readyItems } from "@/lib/client/derived";
import { generateQuestions, useJob } from "@/lib/client/jobs";
import { clearSession, readSession, testDraftKey } from "@/lib/client/session";
import { deleteExam, saveExam, useLibrary } from "@/lib/client/store";
import { calibration, confidentMisses } from "@/lib/study/calibration";
import { daysUntil, examTime, perDay, pickPracticeTest, readinessAt, reviewPlan, type ExamItem } from "@/lib/study/exam";
import { answeredCount, draftItems, parseDraft, type TestDraft } from "@/lib/study/run";
import type { Attempt, ExamRun } from "@/lib/study/types";

function PrepareRow({ setId, title }: { setId: string; title: string }) {
  const job = useJob(setId, "questions");
  return (
    <div className="spread inset small">
      <span>{title} has no questions yet.</span>
      <button className="btn btn-sm" disabled={job.running} onClick={() => void generateQuestions(setId)}>{job.running ? "Writing…" : "Write questions"}</button>
    </div>
  );
}

// Unsure is left out: multiple choice answered without picking is logged as Unsure.
const LEVELS = [
  { id: "sure", label: "Sure" },
  { id: "guess", label: "Guessing" },
] as const;

/** Fewer answers than this at a level says nothing about calibration. */
const MIN_JUDGED = 2;

/** How often each level of confidence was right, and the latest sure-but-wrong answers. */
function SelfJudgement({ items, attempts }: { items: ExamItem[]; attempts: Attempt[] }) {
  const ids = new Set(items.map((i) => i.id));
  const mine = attempts.filter((a) => ids.has(a.itemId));
  const c = calibration(mine);
  const misses = confidentMisses(mine, items).slice(0, 5);
  const levels = LEVELS.filter((l) => c[l.id].n >= MIN_JUDGED);
  return (
    <>
      {levels.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <p className="small muted">How well you judge yourself</p>
          <div className="row small num" style={{ gap: 16 }}>
            {levels.map((l) => <span key={l.id}>{l.label}: {c[l.id].right} of {c[l.id].n} right</span>)}
          </div>
        </div>
      )}
      {misses.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <p className="small muted">Confident misses: you were sure, and it wasn&apos;t right.</p>
          {misses.map((i) => (
            <div key={i.id} className="spread inset small">
              <span className="clamp-2" style={{ flex: "1 1 240px", minWidth: 0 }}>{i.concept || i.prompt}</span>
              <Link href={`/set/${i.setId}?tab=practice`} className="btn btn-sm" aria-label={`Practice ${i.concept || "this question"}`}>Practice</Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** One earlier sitting. Runs saved with per-question results open to show what was missed, by set. */
function PastRun({ run }: { run: ExamRun }) {
  const date = new Date(run.at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const score = <strong className="num">{run.right}/{run.total}</strong>;
  if (!run.results?.some((x) => x.verdict !== "right")) {
    return (
      <div className="inset small stack" style={{ gap: 2 }}>
        <div className="spread num"><span>{date}{run.minutes ? ` · ${run.minutes} min` : ""}</span>{score}</div>
        {run.missed.length > 0 && <span className="muted">Missed: {run.missed.slice(0, 5).join(", ")}</span>}
      </div>
    );
  }
  return (
    <details className="inset small run-row">
      <summary className="num"><span style={{ flex: 1 }}>{date}{run.minutes ? ` · ${run.minutes} min` : ""}</span>{score}</summary>
      <div style={{ paddingTop: 12 }}><MissedBySet results={run.results} nested /></div>
    </details>
  );
}

export default function TestPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { library, ready } = useLibrary();
  const exam = library.exams[id];
  const [mode, setMode] = useState<{ kind: "plan" } | { kind: "study"; items: ExamItem[]; title: string } | { kind: "test"; items: ExamItem[]; draft?: TestDraft }>({ kind: "plan" });
  const [size, setSize] = useState(10);
  const [editing, setEditing] = useState(false);
  // Bumped when a saved sitting is thrown away, so the plan reads storage again.
  const [, setDraftVersion] = useState(0);

  if (!ready) return <main className="page page-narrow"><WritingPlaceholder text="Opening…" /></main>;
  if (!exam) {
    return (
      <main className="page page-narrow stack">
        <h1 className="title">Test not found</h1>
        <Link href="/" className="btn">Back to Today</Link>
      </main>
    );
  }
  const course = library.courses[exam.courseId];
  const sets = exam.setIds.map((s) => library.sets[s]).filter(Boolean);
  const items = readyItems(library, exam.setIds);
  const attempts = attemptsList(library);
  const days = daysUntil(exam.date);
  const cards = new Map(Object.entries(library.cards));
  const r = readinessAt(items, cards, examTime(exam.date));
  const plan = reviewPlan(items, cards, examTime(exam.date));
  const today = plan.slice(0, perDay(plan.length, Math.max(1, days)));
  const runs = Object.values(library.runs).filter((x) => x.examId === exam.id).sort((a, b) => b.at - a.at);
  const courseSets = Object.values(library.sets).filter((s) => s.courseId === exam.courseId);
  const pct = (n: number) => `${(n / Math.max(1, r.total)) * 100}%`;
  // An unsubmitted practice test in this tab, if all its questions still exist.
  const draft = mode.kind === "plan" ? parseDraft(readSession(testDraftKey(exam.id))) : null;
  const resumable = draft ? draftItems(draft, items) : null;
  const startOver = () => {
    clearSession(testDraftKey(exam.id));
    setDraftVersion((v) => v + 1);
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Delete ${exam.name}?`,
      body: "Its practice test scores go too. The study sets it covers stay.",
      confirmLabel: "Delete test",
      danger: true,
    });
    if (!ok) return;
    deleteExam(exam.id);
    router.push(course ? `/class/${course.id}` : "/");
  };

  return (
    <main className="page page-narrow stack" style={{ gap: 24 }}>
      <div className="stack" style={{ gap: 6 }}>
        {course && <Link href={`/class/${course.id}`} className={`row small faint hue-${course.hue}`} style={{ textDecoration: "none", gap: 6 }}><span className="dot" />{course.name}</Link>}
        <div className="spread">
          <h1 className="title">{exam.name}</h1>
          <span className={`chip num${days >= 0 && days <= 3 ? " chip-accent" : ""}`}>{dayLabel(exam.date)}</span>
        </div>
        <p className="small faint">{new Date(examTime(exam.date)).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · covers {sets.length} {sets.length === 1 ? "set" : "sets"}</p>
      </div>
      <ConnectNotice />

      {mode.kind === "study" && (
        <div className="stack">
          <div className="spread"><h2 className="heading">{mode.title}</h2><button className="btn btn-ghost btn-sm" onClick={() => setMode({ kind: "plan" })}>Done</button></div>
          <Practice items={mode.items} size={mode.items.length} onDone={() => setMode({ kind: "plan" })} />
        </div>
      )}
      {mode.kind === "test" && (
        <PracticeTest
          examId={exam.id}
          items={mode.items}
          draft={mode.draft}
          onClose={() => setMode({ kind: "plan" })}
          onStudy={(missed) => setMode({ kind: "study", items: missed, title: "What you missed" })}
        />
      )}

      {mode.kind === "plan" && (
        <>
          <section className="card stack">
            <p className="label">Where you are</p>
            {r.total ? (
              <>
                <div className="bar-split" role="img" aria-label={`${r.recalled} likely to recall on test day, ${r.shaky} at risk, ${r.untried} not tried`}>
                  <span style={{ width: pct(r.recalled), background: "var(--good)" }} />
                  <span style={{ width: pct(r.shaky), background: "var(--warn)" }} />
                </div>
                <div className="row small num" style={{ gap: 16 }}>
                  <span><span className="dot" style={{ background: "var(--good)" }} /> {r.recalled} likely to recall on test day</span>
                  <span><span className="dot" style={{ background: "var(--warn)" }} /> {r.shaky} at risk</span>
                  <span><span className="dot" style={{ background: "var(--surface-2)", outline: "1px solid var(--line)" }} /> {r.untried} not tried</span>
                </div>
              </>
            ) : (
              <p className="muted">No checked questions yet for this test.</p>
            )}
            <SelfJudgement items={items} attempts={attempts} />
            {sets.filter((s) => !s.items.some((i) => i.status === "ok")).map((s) => <PrepareRow key={s.id} setId={s.id} title={s.title} />)}
            {!sets.length && <p className="muted">Pick which sets this test covers below.</p>}
          </section>

          <section className="card stack">
            <div className="spread">
              <div className="stack" style={{ gap: 2 }}>
                <h2 className="heading">Study today</h2>
                <p className="small muted num">
                  {plan.length
                    ? days > 0
                      ? `${plan.length} ${plan.length === 1 ? "question" : "questions"} you'd likely forget by test day. About ${today.length} today keeps you on track.`
                      : `${plan.length} ${plan.length === 1 ? "question" : "questions"} to go over before the test.`
                    : r.total ? "You're on track. Everything should still be fresh on test day." : "Questions appear here once your sets have some."}
                </p>
              </div>
              <button className="btn btn-primary" disabled={!today.length} onClick={() => setMode({ kind: "study", items: today, title: "Today's study" })}>Start</button>
            </div>
          </section>

          <section className="card stack">
            <div className="spread">
              <div className="stack" style={{ gap: 2 }}>
                <h2 className="heading">Practice test</h2>
                <p className="small muted">Mixed questions from every set, weighted toward what you&apos;ve missed. Graded at the end.</p>
              </div>
              {draft && resumable ? (
                <div className="row">
                  <button className="btn btn-ghost" onClick={startOver}>Start over</button>
                  <button className="btn num" onClick={() => setMode({ kind: "test", items: resumable, draft })}>
                    Resume your test ({answeredCount(draft.itemIds, draft.answers)} of {draft.itemIds.length} answered)
                  </button>
                </div>
              ) : (
                <div className="row">
                  <select className="select" style={{ width: "auto", padding: "6px 8px" }} value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Number of questions">
                    {[5, 10, 20, 30].map((n) => <option key={n} value={n}>{n} questions</option>)}
                  </select>
                  <button className="btn" disabled={!items.length} onClick={() => setMode({ kind: "test", items: pickPracticeTest(items, attempts, size, Date.now() % 100000) })}>Start test</button>
                </div>
              )}
            </div>
            {runs.length > 0 && (
              <div className="stack" style={{ gap: 8 }}>
                {runs.slice(0, 5).map((run) => <PastRun key={run.id} run={run} />)}
              </div>
            )}
          </section>

          <section className="stack">
            <div className="spread">
              <p className="label">Covers</p>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing((e) => !e)}>{editing ? "Done" : "Edit"}</button>
            </div>
            {editing ? (
              <div className="card stack" style={{ gap: 8 }}>
                <label className="field"><span>Date</span><input className="input" type="date" value={exam.date} onChange={(e) => e.target.value && saveExam({ ...exam, date: e.target.value })} /></label>
                {courseSets.map((s) => (
                  <label key={s.id} className="row small">
                    <input type="checkbox" checked={exam.setIds.includes(s.id)} onChange={(e) => saveExam({ ...exam, setIds: e.target.checked ? [...exam.setIds, s.id] : exam.setIds.filter((x) => x !== s.id) })} />
                    {s.title}
                  </label>
                ))}
                {!courseSets.length && <p className="small muted">This class has no sets yet.</p>}
                <div><button className="btn btn-sm btn-danger" onClick={() => void remove()}>Delete test</button></div>
              </div>
            ) : (
              <div className="row">{sets.map((s) => <Link key={s.id} href={`/set/${s.id}`} className="chip">{s.title}</Link>)}</div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
