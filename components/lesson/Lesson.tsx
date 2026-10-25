"use client";
import Link from "next/link";
import { Icon } from "../Icon";
import { WritingPlaceholder } from "../Practice";
import { Gauge } from "./Gauge";
import { StepView } from "./StepView";
import { generateLesson, useJob } from "@/lib/client/jobs";
import { updateSet, useLibrary } from "@/lib/client/store";
import { advance, progress } from "@/lib/study/lesson";
import type { Item, Lesson as LessonType, StudySet } from "@/lib/study/types";

// Learn tab: gauge what the student knows, teach step by step with
// checkpoints, then send them to practice. Steps are shown across the top;
// everything else moves forward with buttons.

type Props = { set: StudySet; onPractice: () => void; onCite: (section: number) => void; onAskTutor: (item: Item) => void; active: boolean };

function save(set: StudySet, change: (lesson: LessonType) => LessonType) {
  updateSet(set.id, (s) => (s.lesson ? { ...s, lesson: change(s.lesson) } : s));
}

/** The lesson's steps as a row of numbered marks. Finished steps can be revisited. */
export function Stepper({ set, lesson }: { set: StudySet; lesson: LessonType }) {
  return (
    <ol className="stepper" aria-label="Lesson steps">
      {lesson.steps.map((s, i) => {
        const current = lesson.phase === "learn" && i === lesson.current;
        const state = current ? "current" : s.status;
        return (
          <li key={s.id} className={`stepper-item is-${state}`}>
            <button
              type="button"
              className="stepper-mark"
              aria-current={current ? "step" : undefined}
              aria-label={`Step ${i + 1}: ${s.title}${s.status === "done" ? " (done)" : s.status === "review" ? " (to review)" : ""}`}
              disabled={s.status === "todo" && !current}
              onClick={() => save(set, (l) => ({ ...l, phase: "learn", current: i }))}
            >
              {s.status === "done" && !current ? <Icon name="check" size={16} /> : <span className="num">{i + 1}</span>}
            </button>
            <span className="stepper-title">{s.title}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Finished({ set, lesson, onPractice }: { set: StudySet; lesson: LessonType; onPractice: () => void }) {
  const { library } = useLibrary();
  const p = progress(lesson);
  const exams = Object.values(library.exams).filter((e) => e.setIds.includes(set.id));
  const review = lesson.steps.filter((s) => s.status === "review");
  return (
    <div className="step-screen fade-in">
      <div className="step-intro">
        <span className="finish-mark"><Icon name="check" size={30} /></span>
        <h2 className="step-title">Lesson complete</h2>
        <p className="step-goal">Now make it stick. Practice pulls the ideas back out of memory, which is what turns &ldquo;I read it&rdquo; into &ldquo;I know it&rdquo;.</p>
      </div>
      <div className="stat-row">
        <div className="stat"><span className="stat-num num">{p.done}</span><span className="stat-label">steps learned</span></div>
        <div className="stat"><span className="stat-num num">{p.review}</span><span className="stat-label">to review</span></div>
        <div className="stat"><span className="stat-num num">{p.total}</span><span className="stat-label">steps in all</span></div>
      </div>
      <div className="step-actions">
        {exams.map((e) => <Link key={e.id} href={`/test/${e.id}`} className="btn">Prep for {e.name}</Link>)}
        <button className="btn btn-primary btn-lg" onClick={onPractice}>Practice now <Icon name="arrowRight" size={18} /></button>
      </div>
      {review.length > 0 && (
        <div className="card stack">
          <h3 className="heading">Worth another look</h3>
          {review.map((s) => (
            <div key={s.id} className="spread">
              <span>{s.title}</span>
              <button
                className="btn btn-sm"
                onClick={() => save(set, (l) => ({ ...l, phase: "learn", current: l.steps.findIndex((x) => x.id === s.id), steps: l.steps.map((x) => (x.id === s.id ? { ...x, status: "todo", tries: 0, explanations: [], checkpointIds: [] } : x)) }))}
              >
                Go over it again
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Lesson({ set, onPractice, onCite, onAskTutor, active }: Props) {
  const job = useJob(set.id, "lesson");
  const lesson = set.lesson;

  if (!lesson) {
    if (job.running || (!set.sections.length && !job.error)) return <WritingPlaceholder text="Reading your material and planning a lesson…" />;
    return (
      <div className="step-screen">
        <div className="step-intro">
          <span className="finish-mark"><Icon name="idea" size={28} /></span>
          <h2 className="step-title">Learn this step by step</h2>
          <p className="step-goal">A quick check of what you already know, then short lessons on the rest, each ending with a checkpoint question.</p>
        </div>
        {job.error && <p className="notice notice-bad" role="alert">{job.error}</p>}
        <div className="step-actions"><button className="btn btn-primary btn-lg" disabled={!set.sections.length} onClick={() => void generateLesson(set.id)}>{job.error ? "Try again" : "Build my lesson"}</button></div>
      </div>
    );
  }

  if (lesson.phase === "gauge") return <Gauge set={set} lesson={lesson} />;

  if (lesson.phase === "done") {
    return (
      <div className="stack" style={{ gap: 28 }}>
        <Stepper set={set} lesson={lesson} />
        <Finished set={set} lesson={lesson} onPractice={onPractice} />
      </div>
    );
  }

  const index = Math.min(lesson.current, lesson.steps.length - 1);
  const step = lesson.steps[index];
  const next = lesson.steps.slice(index + 1).find((s) => s.status === "todo") ?? null;
  return (
    <div className="stack" style={{ gap: 28 }}>
      <Stepper set={set} lesson={lesson} />
      <StepView
        key={step.id}
        set={set}
        step={step}
        index={index}
        total={lesson.steps.length}
        next={next}
        onDone={() => {
          save(set, (l) => advance({ ...l, current: index }));
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onCite={onCite}
        onAskTutor={onAskTutor}
        active={active}
      />
    </div>
  );
}
