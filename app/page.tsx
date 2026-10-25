"use client";
import Link from "next/link";
import { ConnectNotice } from "@/components/ConnectNotice";
import { CreateCard } from "@/components/CreateCard";
import { CourseCard, ExamRow, NewCourse, SetRow } from "@/components/Library";
import { usePrefs } from "@/lib/client/ai";
import { courseDue, dueItems, setStats, todayItems } from "@/lib/client/derived";
import { useLibrary, useSyncState } from "@/lib/client/store";
import { daysUntil } from "@/lib/study/exam";

/** Rough minutes for a session: about 20 seconds a review, 45 a new question. */
const sessionMinutes = (reviews: number, fresh: number) => Math.max(1, Math.round((reviews * 20 + fresh * 45) / 60));

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Today() {
  const { library, ready } = useLibrary();
  const prefs = usePrefs();
  const sync = useSyncState();
  const courses = Object.values(library.courses).sort((a, b) => a.name.localeCompare(b.name));
  const sets = Object.values(library.sets).sort((a, b) => b.updatedAt - a.updatedAt);
  const exams = Object.values(library.exams).filter((e) => daysUntil(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const due = dueItems(library).length;
  const today = todayItems(library, prefs);
  const todayTotal = today.due.length + today.fresh.length;
  // The most recently touched set with a lesson still going.
  const lessonSet = sets.find((s) => s.lesson && s.lesson.phase !== "done" && s.lesson.steps.length);
  const lesson = lessonSet ? setStats(library, lessonSet.id).lesson : null;
  const unfiled = sets.filter((s) => !s.courseId || !library.courses[s.courseId]);
  const empty = ready && !sets.length && !courses.length;

  return (
    <main className="page stack" style={{ gap: 32 }}>
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="display" suppressHydrationWarning>{empty ? "What are you learning?" : greeting()}</h1>
        {ready ? (
          <p className="muted">
            {empty
              ? "Give Mullwell your notes, a PDF, a lecture or just a topic. It quizzes you first, checks every answer against your material, and schedules reviews so it sticks."
              : due
                ? `${due} ${due === 1 ? "card is" : "cards are"} due for review.`
                : "Nothing due right now."}
          </p>
        ) : (
          <div className="skeleton" style={{ width: 240, maxWidth: "100%", height: 18, marginTop: 4 }} aria-hidden />
        )}
      </div>
      {sync === "offline" && <p className="notice" role="status">You&apos;re offline. Changes are kept on this device and sync when you&apos;re back.</p>}
      <ConnectNotice />

      {ready && !empty && (
        <section className="stack" aria-label="Up next">
          <p className="label">Up next</p>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            <div className="card spread" style={{ padding: 16 }}>
              {todayTotal > 0 ? (
                <>
                  <span className="num">
                    <span style={{ fontWeight: 600 }}>Today:</span>{" "}
                    {[today.due.length && plural(today.due.length, "review", "reviews"), today.fresh.length && `${today.fresh.length} new`, `~${sessionMinutes(today.due.length, today.fresh.length)} min`].filter(Boolean).join(" · ")}
                  </span>
                  <Link href="/review" className="btn btn-primary btn-sm">Start</Link>
                </>
              ) : (
                <span className="muted">All caught up.</span>
              )}
            </div>
            {lessonSet && lesson && (
              <Link href={`/set/${lessonSet.id}?tab=learn`} className="card card-link stack" style={{ padding: 16, gap: 2 }}>
                <span style={{ fontWeight: 600 }}>Continue lesson: {lessonSet.title}</span>
                <span className="meta num clamp-2">Step {lesson.step} of {lesson.total} · {lesson.currentTitle}</span>
              </Link>
            )}
            {exams.slice(0, 4).map((e) => <ExamRow key={e.id} exam={e} course={library.courses[e.courseId]} />)}
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
              <CourseCard key={c.id} course={c} sets={sets.filter((s) => s.courseId === c.id)} exams={Object.values(library.exams).filter((e) => e.courseId === c.id)} due={courseDue(library, c.id)} />
            ))}
          </div>
        ) : (
          ready && <p className="empty">Add your classes to keep each one&apos;s material and tests together.</p>
        )}
      </section>

      {unfiled.length > 0 && (
        <section className="stack">
          <p className="label">{courses.length ? "Not in a class" : "Your sets"}</p>
          <div className="grid">{unfiled.map((s) => <SetRow key={s.id} set={s} stats={setStats(library, s.id)} />)}</div>
        </section>
      )}
    </main>
  );
}
