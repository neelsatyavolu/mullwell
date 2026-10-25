"use client";
import Link from "next/link";
import { useState } from "react";
import type { SetStats } from "@/lib/client/derived";
import { createCourse, useLibrary } from "@/lib/client/store";
import { daysUntil } from "@/lib/study/exam";
import { COURSE_HUES, type Course, type Exam, type StudySet } from "@/lib/study/types";

// Shared pieces of the library views: class cards, set rows, test rows.

export function dayLabel(date: string): string {
  const d = daysUntil(date);
  if (d < 0) return `${-d} ${d === -1 ? "day" : "days"} ago`;
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return `In ${d} days`;
}

export function SetRow({ set, stats }: { set: StudySet; stats: SetStats }) {
  const pct = (n: number) => `${(n / Math.max(1, stats.ready)) * 100}%`;
  return (
    <Link href={`/set/${set.id}`} className="card card-link stack" style={{ gap: 6, padding: 18 }}>
      <span className="heading" style={{ fontSize: 16 }}>{set.title}</span>
      {stats.ready > 0 && (
        <span className="bar-split" style={{ height: 4 }} role="img" aria-label={`${stats.recalled} recalled, ${stats.shaky} at risk, ${stats.untried} not tried`}>
          <span style={{ width: pct(stats.recalled), background: "var(--good)" }} />
          <span style={{ width: pct(stats.shaky), background: "var(--warn)" }} />
        </span>
      )}
      {stats.lesson ? (
        <span className="meta num">Lesson: step {stats.lesson.step} of {stats.lesson.total}</span>
      ) : stats.due > 0 ? (
        <span><span className="chip chip-accent num">{stats.due} due</span></span>
      ) : (
        <span className="meta num">
          {stats.ready} {stats.ready === 1 ? "question" : "questions"} · {set.origin === "web" ? "from the web" : "from your notes"}
        </span>
      )}
    </Link>
  );
}

export function ExamRow({ exam, course }: { exam: Exam; course?: Course }) {
  const d = daysUntil(exam.date);
  return (
    <Link href={`/test/${exam.id}`} className={`card card-link spread hue-${course?.hue ?? "sage"}`} style={{ padding: 16 }}>
      <span className="row" style={{ gap: 10 }}>
        <span className="dot" />
        <span className="stack" style={{ gap: 0 }}>
          <span style={{ fontWeight: 600 }}>{exam.name}</span>
          {course && <span className="meta">{course.name}</span>}
        </span>
      </span>
      <span className={`chip num${d >= 0 && d <= 3 ? " chip-accent" : ""}`}>{dayLabel(exam.date)}</span>
    </Link>
  );
}

export function CourseCard({ course, sets, exams, due }: { course: Course; sets: StudySet[]; exams: Exam[]; due: number }) {
  const next = exams.filter((e) => daysUntil(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
  return (
    <Link href={`/class/${course.id}`} className={`card card-link hue-rule stack hue-${course.hue}`} style={{ gap: 6 }}>
      <span className="spread" style={{ alignItems: "flex-start" }}>
        <span className="heading">{course.name}</span>
        {due > 0 && <span className="chip chip-accent num">{due} due</span>}
      </span>
      <span className="meta num">{sets.length} {sets.length === 1 ? "set" : "sets"}</span>
      {next ? <span className="small muted">{next.name}: {dayLabel(next.date).toLowerCase()}</span> : <span className="meta">No tests scheduled</span>}
    </Link>
  );
}

export function NewCourse({ onDone }: { onDone?: (c: Course) => void }) {
  const { library } = useLibrary();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  if (!open) return <button className="btn" onClick={() => setOpen(true)}>New class</button>;
  const hue = COURSE_HUES[Object.keys(library.courses).length % COURSE_HUES.length];
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        const c = createCourse(name, hue);
        setName("");
        setOpen(false);
        onDone?.(c);
      }}
    >
      <input className="input" style={{ width: 240 }} autoFocus placeholder="e.g. AP Biology" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Class name" />
      <button className="btn btn-primary" disabled={!name.trim()}>Add</button>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}
