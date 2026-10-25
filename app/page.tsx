"use client";
import Link from "next/link";
import { ConnectNotice } from "@/components/ConnectNotice";
import { CreateCard } from "@/components/CreateCard";
import { CourseCard, ExamRow, NewCourse, SetRow } from "@/components/Library";
import { dueItems } from "@/lib/client/derived";
import { useLibrary } from "@/lib/client/store";
import { daysUntil } from "@/lib/study/exam";

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Today() {
  const { library, ready } = useLibrary();
  const courses = Object.values(library.courses).sort((a, b) => a.name.localeCompare(b.name));
  const sets = Object.values(library.sets).sort((a, b) => b.updatedAt - a.updatedAt);
  const exams = Object.values(library.exams).filter((e) => daysUntil(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const due = dueItems(library).length;
  const unfiled = sets.filter((s) => !s.courseId || !library.courses[s.courseId]);
  const empty = ready && !sets.length && !courses.length;

  return (
    <main className="page stack" style={{ gap: 32 }}>
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="display" suppressHydrationWarning>{empty ? "What are you learning?" : greeting()}</h1>
        <p className="muted">
          {empty
            ? "Give Mullwell your notes, a PDF, a lecture or just a topic. It quizzes you first, checks every answer against your material, and schedules reviews so it sticks."
            : due
              ? `${due} ${due === 1 ? "card is" : "cards are"} due for review.`
              : "Nothing due right now."}
        </p>
      </div>
      <ConnectNotice />

      {(due > 0 || exams.length > 0) && (
        <section className="stack" aria-label="Up next">
          <p className="label">Up next</p>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {due > 0 && (
              <Link href="/review" className="card card-link spread" style={{ padding: 16 }}>
                <span style={{ fontWeight: 600 }}>Review</span>
                <span className="chip chip-accent num">{due} due</span>
              </Link>
            )}
            {exams.slice(0, 5).map((e) => <ExamRow key={e.id} exam={e} course={library.courses[e.courseId]} />)}
          </div>
        </section>
      )}

      <CreateCard />

      <section className="stack">
        <div className="spread">
          <p className="label">Classes</p>
          <NewCourse />
        </div>
        {courses.length ? (
          <div className="grid">
            {courses.map((c) => (
              <CourseCard key={c.id} course={c} sets={sets.filter((s) => s.courseId === c.id)} exams={Object.values(library.exams).filter((e) => e.courseId === c.id)} />
            ))}
          </div>
        ) : (
          ready && <p className="empty">Add your classes to keep each one&apos;s material and tests together.</p>
        )}
      </section>

      {unfiled.length > 0 && (
        <section className="stack">
          <p className="label">{courses.length ? "Not in a class" : "Your sets"}</p>
          <div className="grid">{unfiled.map((s) => <SetRow key={s.id} set={s} />)}</div>
        </section>
      )}
    </main>
  );
}
