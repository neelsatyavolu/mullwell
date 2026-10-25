"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CreateCard } from "@/components/CreateCard";
import { confirmDialog } from "@/components/Dialog";
import { InlineRename } from "@/components/InlineRename";
import { ExamRow, SetRow } from "@/components/Library";
import { WritingPlaceholder } from "@/components/Practice";
import { setStats } from "@/lib/client/derived";
import { deleteCourse, saveCourse, saveExam, useLibrary } from "@/lib/client/store";
import { daysUntil } from "@/lib/study/exam";
import { newId } from "@/lib/study/ids";
import { COURSE_HUES } from "@/lib/study/types";

function todayPlus(days: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ClassPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { library, ready } = useLibrary();
  const course = library.courses[id];
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayPlus(7));
  const [picked, setPicked] = useState<string[] | null>(null);
  const [renaming, setRenaming] = useState(false);
  const renameButton = useRef<HTMLButtonElement>(null);

  if (!ready) return <main className="page"><WritingPlaceholder text="Opening…" /></main>;
  if (!course) {
    return (
      <main className="page page-narrow stack">
        <h1 className="title">Class not found</h1>
        <Link href="/" className="btn">Back to Today</Link>
      </main>
    );
  }
  const sets = Object.values(library.sets).filter((s) => s.courseId === id).sort((a, b) => b.updatedAt - a.updatedAt);
  const exams = Object.values(library.exams).filter((e) => e.courseId === id);
  // Upcoming tests nearest first, then past ones most recent first.
  const upcoming = exams.filter((e) => daysUntil(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const past = exams.filter((e) => daysUntil(e.date) < 0).sort((a, b) => b.date.localeCompare(a.date));
  const chosen = picked ?? sets.map((s) => s.id);

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Delete ${course.name}?`,
      body: `${exams.length ? `Its ${exams.length} ${exams.length === 1 ? "test goes" : "tests go"} too. ` : ""}Its study sets stay, under Not in a class.`,
      confirmLabel: "Delete class",
      danger: true,
    });
    if (!ok) return;
    deleteCourse(course.id);
    router.push("/");
  };

  function addExam(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !date) return;
    const exam = { id: newId("t"), courseId: id, name: name.trim().slice(0, 80), date, setIds: chosen, createdAt: Date.now() };
    saveExam(exam);
    router.push(`/test/${exam.id}`);
  }

  return (
    <main className="page stack" style={{ gap: 32 }}>
      <div className={`stack hue-${course.hue}`} style={{ gap: 10 }}>
        {renaming ? (
          <InlineRename value={course.name} label="Class name" onSave={(n) => saveCourse({ ...course, name: n })} onClose={() => setRenaming(false)} returnFocus={renameButton} />
        ) : (
          <div className="row"><span className="dot" style={{ width: 12, height: 12 }} /><h1 className="title">{course.name}</h1></div>
        )}
        <div className="row small">
          {COURSE_HUES.map((h) => (
            <button key={h} type="button" className={`hue-${h}`} aria-label={`Color ${h}`} aria-pressed={course.hue === h} onClick={() => saveCourse({ ...course, hue: h })}
              style={{ width: 18, height: 18, borderRadius: 999, background: "var(--hue)", border: course.hue === h ? "2px solid var(--ink)" : "2px solid transparent", cursor: "pointer" }} />
          ))}
          <button ref={renameButton} className="btn btn-sm btn-ghost" onClick={() => setRenaming(true)}>Rename</button>
          <button className="btn btn-sm btn-ghost btn-danger" onClick={() => void remove()}>Delete</button>
        </div>
      </div>

      <section className="stack">
        <div className="spread">
          <p className="label">Tests</p>
          {!adding && <button className="btn" onClick={() => setAdding(true)}>Add a test</button>}
        </div>
        {adding && (
          <form className="card stack" onSubmit={addExam}>
            <div className="row" style={{ alignItems: "flex-end" }}>
              <label className="field" style={{ flex: "1 1 220px" }}><span>Name</span><input className="input" autoFocus placeholder="e.g. Unit 3 test" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
              <label className="field"><span>Date</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            </div>
            {sets.length > 0 && (
              <fieldset className="stack" style={{ border: "none", padding: 0, margin: 0, gap: 6 }}>
                <legend className="small muted" style={{ marginBottom: 6 }}>What it covers</legend>
                {sets.map((s) => (
                  <label key={s.id} className="row small">
                    <input type="checkbox" checked={chosen.includes(s.id)} onChange={(e) => setPicked(e.target.checked ? [...chosen, s.id] : chosen.filter((x) => x !== s.id))} />
                    {s.title}
                  </label>
                ))}
              </fieldset>
            )}
            <div className="row">
              <button className="btn btn-primary" disabled={!name.trim() || !date}>Add test</button>
              <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </form>
        )}
        {upcoming.length > 0 && <div className="stack" style={{ gap: 8 }}>{upcoming.map((e) => <ExamRow key={e.id} exam={e} />)}</div>}
        {past.length > 0 && (
          <div className="stack faint" style={{ gap: 8 }}>
            <p className="label">Past</p>
            {past.map((e) => <ExamRow key={e.id} exam={e} />)}
          </div>
        )}
        {!exams.length && !adding && <p className="empty">Add a test and Mullwell plans your reviews up to the day.</p>}
      </section>

      <section className="stack">
        <p className="label">Study sets</p>
        {sets.length ? <div className="grid">{sets.map((s) => <SetRow key={s.id} set={s} stats={setStats(library, s.id)} />)}</div> : <p className="empty">No material yet. Add your first lecture, chapter or study guide below.</p>}
      </section>

      <CreateCard courseId={course.id} />
    </main>
  );
}
