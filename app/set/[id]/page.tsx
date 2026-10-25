"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConnectNotice } from "@/components/ConnectNotice";
import { AudioRecap, ConceptMap } from "@/components/Extras";
import { Markdown } from "@/components/Markdown";
import { Practice, WritingPlaceholder } from "@/components/Practice";
import { ReviewDeck } from "@/components/ReviewDeck";
import { Tutor } from "@/components/Tutor";
import { Lesson } from "@/components/lesson/Lesson";
import { appendText } from "@/lib/client/create";
import { generateNotes, generateQuestions, recheck, useJob } from "@/lib/client/jobs";
import { deleteSet, saveSet, updateSet, useLibrary } from "@/lib/client/store";
import type { Item, StudySet } from "@/lib/study/types";

const TABS = ["learn", "practice", "notes", "cards", "tutor", "source", "more"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { learn: "Learn", practice: "Practice", notes: "Notes", cards: "Cards", tutor: "Tutor", source: "Source", more: "More" };

/** Where a set opens: the lesson until it's finished, then practice. Older sets without a lesson open on practice. */
function defaultTab(set: StudySet | undefined): Tab {
  if (!set) return "learn";
  if (set.lesson) return set.lesson.phase === "done" ? "practice" : "learn";
  return set.items.length ? "practice" : "learn";
}

export default function SetPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const { library, ready } = useLibrary();
  const set = library.sets[id];
  const asked = (TABS as readonly string[]).includes(search.get("tab") ?? "") ? (search.get("tab") as Tab) : null;
  // Null until the set has loaded; then the default is fixed once, so finishing the lesson doesn't yank the student to Practice.
  const [chosen, setTab] = useState<Tab | null>(asked);
  if (chosen === null && set) setTab(defaultTab(set));
  const tab = chosen ?? defaultTab(set);
  const [lit, setLit] = useState<number | null>(null);
  const [tutorFocus, setTutorFocus] = useState<Item | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState("");
  const questions = useJob(id, "questions");
  const notesJob = useJob(id, "notes");
  const prepare = useJob(id, "prepare");
  const lessonJob = useJob(id, "lesson");
  const started = useRef(false);
  const rechecked = useRef(false);

  // Questions still marked "checking" with no job running were cut off; check them again.
  useEffect(() => {
    if (!set || rechecked.current || questions.running || prepare.running || lessonJob.running) return;
    rechecked.current = true;
    if (set.items.some((i) => i.status === "checking")) void recheck(set.id);
  }, [set, questions.running, prepare.running, lessonJob.running]);

  // Notes are prepared in the background once the lesson is finished (or for sets without one), so they don't slow the lesson down.
  useEffect(() => {
    if (!set || started.current || set.notes !== null || !set.sections.length || questions.running || prepare.running) return;
    if (set.lesson && set.lesson.phase !== "done") return;
    if (set.items.some((i) => i.status === "ok")) {
      started.current = true;
      void generateNotes(set.id);
    }
  }, [set, questions.running, prepare.running]);

  if (!ready) return <main className="page page-narrow"><WritingPlaceholder text="Opening…" /></main>;
  if (!set) {
    return (
      <main className="page page-narrow stack">
        <h1 className="title">Set not found</h1>
        <p className="muted">It may have been deleted, or it hasn&apos;t synced to this device yet.</p>
        <Link href="/" className="btn">Back to Today</Link>
      </main>
    );
  }

  const course = set.courseId ? library.courses[set.courseId] : null;
  const items = set.items.map((i) => ({ ...i, setId: set.id }));
  const ready_ = items.filter((i) => i.status === "ok");
  const writing = questions.running || prepare.running;
  const cite = (n: number) => {
    setTab("source");
    setLit(n);
    requestAnimationFrame(() => document.getElementById(`passage-${n}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    setTimeout(() => setLit((x) => (x === n ? null : x)), 2200);
  };
  const jobError = questions.error ?? prepare.error;

  return (
    <main className="page page-study stack">
      <div className="stack" style={{ gap: 6 }}>
        <div className="row small faint">
          {course ? (
            <Link href={`/class/${course.id}`} className={`row hue-${course.hue}`} style={{ textDecoration: "none", gap: 6 }}>
              <span className="dot" />{course.name}
            </Link>
          ) : (
            <span>No class</span>
          )}
          <span aria-hidden>·</span>
          <span>{set.origin === "web" ? "From the web" : "From your notes"}</span>
        </div>
        {editing ? (
          <form className="row" onSubmit={(e) => (e.preventDefault(), setEditing(false))}>
            <input className="input" autoFocus defaultValue={set.title} maxLength={80} onBlur={(e) => (saveSet({ ...set, title: e.target.value.trim() || set.title, titleEdited: set.titleEdited || e.target.value.trim() !== set.title }), setEditing(false))} aria-label="Set title" />
          </form>
        ) : (
          <h1 className="title" onDoubleClick={() => setEditing(true)}>{set.title}</h1>
        )}
      </div>
      <ConnectNotice />
      {jobError && (
        <div className="notice notice-bad row" style={{ justifyContent: "space-between" }} role="alert">
          <span>{jobError}</span>
          {questions.needsConnect || prepare.needsConnect ? <Link className="btn btn-sm" href="/settings">Connect</Link> : set.sections.length > 0 && <button className="btn btn-sm" onClick={() => void generateQuestions(set.id)}>Try again</button>}
        </div>
      )}

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {TAB_LABEL[t]}
            {t === "cards" && ready_.length > 0 && <span className="faint num"> {ready_.length}</span>}
          </button>
        ))}
      </div>

      {/* Learn, Practice and Tutor stay mounted behind other tabs so citations don't reset where the student is. */}
      <div hidden={tab !== "learn"}>
        <Lesson set={set} onPractice={() => setTab("practice")} onCite={cite} onAskTutor={(item) => (setTutorFocus(item), setTab("tutor"))} active={tab === "learn"} />
      </div>
      <div hidden={tab !== "practice"}>
        {!set.sections.length ? (
          <div className="stack">
            {prepare.running ? (
              <WritingPlaceholder text={prepare.status ? `${prepare.status}…` : set.origin === "web" ? "Researching your topic…" : "Reading your photos…"} />
            ) : (
              !prepare.error && <p className="empty">This set has no material yet.</p>
            )}
            {set.notes && <div className="card"><Markdown text={set.notes} /></div>}
          </div>
        ) : (
          <Practice
            key={set.id}
            items={items}
            writing={writing}
            onMore={() => void generateQuestions(set.id)}
            onCite={(_, n) => cite(n)}
            onAskTutor={(item) => (setTutorFocus(item), setTab("tutor"))}
            emptyText={jobError ? "No questions yet." : "No questions yet. Use More questions to write some."}
            active={tab === "practice"}
          />
        )}
      </div>

      {tab === "notes" &&
        (set.notes ? (
          <div className="card stack">
            <Markdown text={set.notes} onCite={cite} />
            {notesJob.running && <p className="small muted pulse">Writing…</p>}
            {!notesJob.running && set.origin === "notes" && (
              <div className="row"><button className="btn btn-sm btn-ghost" onClick={() => void generateNotes(set.id)}>Rewrite notes</button></div>
            )}
          </div>
        ) : notesJob.running ? (
          <WritingPlaceholder text="Writing your notes…" />
        ) : (
          <div className="card stack">
            <p className="muted">Organized notes with every point linked to the passage it came from.</p>
            {notesJob.error && <p className="notice notice-bad">{notesJob.error}</p>}
            <div><button className="btn btn-primary" disabled={!set.sections.length} onClick={() => void generateNotes(set.id)}>Write notes</button></div>
          </div>
        ))}

      {tab === "cards" && <ReviewDeck key={set.id} items={ready_} onCite={(_, n) => cite(n)} emptyText={writing ? "Cards appear as questions are written and checked." : "No cards yet."} />}

      <div hidden={tab !== "tutor"}>
        <Tutor key={tutorFocus?.id ?? "free"} set={set} focus={tutorFocus} onCite={cite} />
      </div>

      {tab === "source" && (
        <div className="stack">
          {set.sources.length > 0 && (
            <div className="card stack">
              <p className="label">Web sources</p>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {set.sources.map((s) => (
                  <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer noopener">{s.title ?? new URL(s.url).hostname}</a></li>
                ))}
              </ul>
            </div>
          )}
          <div className="card" style={{ padding: 8 }}>
            {set.sections.map((s) => (
              <section key={s.id} id={`passage-${s.id}`} className={`passage${lit === s.id ? " is-lit" : ""}`}>
                <p className="small faint" style={{ marginBottom: 4 }}><span className="cite">§{s.id}</span> {s.title}</p>
                <div className="reading passage-text">{s.text}</div>
              </section>
            ))}
          </div>
          {set.origin === "notes" && (
            <div className="card stack">
              <h3 className="heading">Add more material</h3>
              <textarea className="textarea" rows={4} value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Paste the next lecture or chapter. New questions will be written from it." />
              <div><button className="btn" disabled={adding.trim().length < 80} onClick={() => (appendText(set.id, adding), setAdding(""), setTab("practice"))}>Add and practice</button></div>
            </div>
          )}
        </div>
      )}

      {tab === "more" && (
        <div className="stack">
          <AudioRecap set={set} />
          <ConceptMap set={set} />
          <div className="card stack">
            <h3 className="heading">This set</h3>
            <label className="field">
              <span>Class</span>
              <select className="select" value={set.courseId ?? ""} onChange={(e) => updateSet(set.id, (s) => ({ ...s, courseId: e.target.value || null }))}>
                <option value="">No class</option>
                {Object.values(library.courses).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <div className="row">
              <button className="btn btn-sm" onClick={() => setEditing(true)}>Rename</button>
              <button className="btn btn-sm btn-danger" onClick={() => confirm(`Delete “${set.title}” and its review history?`) && (deleteSet(set.id), router.push(course ? `/class/${course.id}` : "/"))}>Delete set</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
