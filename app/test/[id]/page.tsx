"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ConnectNotice } from "@/components/ConnectNotice";
import { dayLabel } from "@/components/Library";
import { Practice } from "@/components/Practice";
import { PracticeTest } from "@/components/PracticeTest";
import { attemptsList, readyItems } from "@/lib/client/derived";
import { generateQuestions, useJob } from "@/lib/client/jobs";
import { deleteExam, saveExam, useLibrary } from "@/lib/client/store";
import { daysUntil, examTime, perDay, pickPracticeTest, readiness, reviewPlan, type ExamItem } from "@/lib/study/exam";

function PrepareRow({ setId, title }: { setId: string; title: string }) {
  const job = useJob(setId, "questions");
  return (
    <div className="spread inset small">
      <span>{title} has no questions yet.</span>
      <button className="btn btn-sm" disabled={job.running} onClick={() => void generateQuestions(setId)}>{job.running ? "Writing…" : "Write questions"}</button>
    </div>
  );
}

export default function TestPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { library, ready } = useLibrary();
  const exam = library.exams[id];
  const [mode, setMode] = useState<{ kind: "plan" } | { kind: "study"; items: ExamItem[] } | { kind: "test"; items: ExamItem[] }>({ kind: "plan" });
  const [size, setSize] = useState(10);
  const [editing, setEditing] = useState(false);

  if (!ready) return <main className="page page-narrow" />;
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
  const r = readiness(items, attempts);
  const days = daysUntil(exam.date);
  const cards = new Map(Object.entries(library.cards));
  const plan = reviewPlan(items, cards, examTime(exam.date));
  const today = plan.slice(0, perDay(plan.length, Math.max(1, days)));
  const runs = Object.values(library.runs).filter((x) => x.examId === exam.id).sort((a, b) => b.at - a.at);
  const courseSets = Object.values(library.sets).filter((s) => s.courseId === exam.courseId);
  const pct = (n: number) => `${(n / Math.max(1, r.total)) * 100}%`;

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
          <div className="spread"><h2 className="heading">Today&apos;s study</h2><button className="btn btn-ghost btn-sm" onClick={() => setMode({ kind: "plan" })}>Done</button></div>
          <Practice items={mode.items} size={mode.items.length} />
        </div>
      )}
      {mode.kind === "test" && <PracticeTest examId={exam.id} items={mode.items} onClose={() => setMode({ kind: "plan" })} />}

      {mode.kind === "plan" && (
        <>
          <section className="card stack">
            <p className="label">Where you are</p>
            {r.total ? (
              <>
                <div className="bar-split" role="img" aria-label={`${r.recalled} recalled, ${r.shaky} shaky, ${r.untried} not tried`}>
                  <span style={{ width: pct(r.recalled), background: "var(--good)" }} />
                  <span style={{ width: pct(r.shaky), background: "var(--warn)" }} />
                </div>
                <div className="row small num" style={{ gap: 16 }}>
                  <span><span className="dot" style={{ background: "var(--good)" }} /> {r.recalled} recalled last try</span>
                  <span><span className="dot" style={{ background: "var(--warn)" }} /> {r.shaky} shaky</span>
                  <span><span className="dot" style={{ background: "var(--surface-2)", outline: "1px solid var(--line)" }} /> {r.untried} not tried</span>
                </div>
              </>
            ) : (
              <p className="muted">No checked questions yet for this test.</p>
            )}
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
              <button className="btn btn-primary" disabled={!today.length} onClick={() => setMode({ kind: "study", items: today })}>Start</button>
            </div>
          </section>

          <section className="card stack">
            <div className="spread">
              <div className="stack" style={{ gap: 2 }}>
                <h2 className="heading">Practice test</h2>
                <p className="small muted">Mixed questions from every set, weighted toward what you&apos;ve missed. Graded at the end.</p>
              </div>
              <div className="row">
                <select className="select" style={{ width: "auto", padding: "6px 8px" }} value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Number of questions">
                  {[5, 10, 20, 30].map((n) => <option key={n} value={n}>{n} questions</option>)}
                </select>
                <button className="btn" disabled={!items.length} onClick={() => setMode({ kind: "test", items: pickPracticeTest(items, attempts, size, Date.now() % 100000) })}>Start test</button>
              </div>
            </div>
            {runs.length > 0 && (
              <div className="stack" style={{ gap: 8 }}>
                {runs.slice(0, 5).map((run) => (
                  <div key={run.id} className="inset small stack" style={{ gap: 2 }}>
                    <div className="spread num"><span>{new Date(run.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span><strong>{run.right}/{run.total}</strong></div>
                    {run.missed.length > 0 && <span className="faint">Missed: {run.missed.slice(0, 5).join(", ")}</span>}
                  </div>
                ))}
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
                <div><button className="btn btn-sm btn-danger" onClick={() => confirm(`Delete ${exam.name}?`) && (deleteExam(exam.id), router.push(course ? `/class/${course.id}` : "/"))}>Delete test</button></div>
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
