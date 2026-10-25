"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createFromImages, createFromText, createFromTopic, MAX_MATERIAL_CHARS } from "@/lib/client/create";
import { extractFiles } from "@/lib/client/extract";
import { canTranscribe, startTranscribing } from "@/lib/client/speech";
import { useLibrary } from "@/lib/client/store";

type Mode = "paste" | "file" | "topic" | "lecture";
const MODES: { id: Mode; label: string }[] = [
  { id: "paste", label: "Paste notes" },
  { id: "file", label: "PDF or photos" },
  { id: "topic", label: "Learn a topic" },
  { id: "lecture", label: "Record a lecture" },
];

/** The one place material comes in. Opens the new set as soon as it exists. */
export function CreateCard({ courseId: fixedCourse }: { courseId?: string }) {
  const router = useRouter();
  const { library } = useLibrary();
  const courses = Object.values(library.courses).sort((a, b) => a.name.localeCompare(b.name));
  const [mode, setMode] = useState<Mode>("paste");
  const [courseId, setCourseId] = useState<string>(fixedCourse ?? "");
  const [text, setText] = useState("");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<"intro" | "exam">("exam");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const stopRef = useRef<(() => void) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const target = fixedCourse ?? (courseId || null);

  useEffect(() => () => stopRef.current?.(), []);

  const open = (id: string) => router.push(`/set/${id}`);

  function fromText(material: string, title?: string) {
    if (material.trim().length < 80) return setError("Add a bit more material (a paragraph or two) so there's something to practice.");
    open(createFromText(material, target, title));
  }

  async function fromFiles(files: File[]) {
    if (!files.length) return;
    setError(null);
    setBusy("Reading your file…");
    try {
      const got = await extractFiles(files);
      if (got.kind === "text") return fromText(got.text, got.title);
      open(createFromImages(got.images, target, got.title));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setBusy(null);
    }
  }

  function toggleLecture() {
    if (listening) {
      stopRef.current?.();
      stopRef.current = null;
      setListening(false);
      setInterim("");
      return;
    }
    setError(null);
    const base = text ? `${text.trim()} ` : "";
    stopRef.current = startTranscribing(
      (finalText, heard) => {
        setText(base + finalText);
        setInterim(heard);
      },
      (message) => {
        setError(message);
        setListening(false);
      },
    );
    setListening(true);
  }

  return (
    <section className="card stack" aria-label="Add material">
      <div className="spread">
        <h2 className="heading">Add material</h2>
        {!fixedCourse && courses.length > 0 && (
          <label className="row small muted">
            <span>Class</span>
            <select className="select" style={{ width: "auto", padding: "4px 8px" }} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">No class</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="modes" role="group" aria-label="Kind of material">
        {MODES.map((m) => (
          <button key={m.id} type="button" className="mode" aria-pressed={mode === m.id} onClick={() => (setMode(m.id), setError(null))}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === "paste" && (
        <form className="stack" onSubmit={(e) => (e.preventDefault(), fromText(text))}>
          <textarea
            className="textarea"
            rows={6}
            maxLength={MAX_MATERIAL_CHARS}
            placeholder="Paste class notes, a reading, slides text or a study guide."
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Your notes"
          />
          <div className="spread">
            <span className="small faint num">{text.length ? `${text.length.toLocaleString()} characters` : "Questions are written from this text only."}</span>
            <button className="btn btn-primary" disabled={!text.trim()}>Start practicing</button>
          </div>
        </form>
      )}

      {mode === "file" && (
        <div
          className={`drop stack${over ? " is-over" : ""}`}
          style={{ padding: 28, alignItems: "center", textAlign: "center" }}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void fromFiles([...e.dataTransfer.files]);
          }}
        >
          <p className="muted">Drop a PDF, a text file, or up to 6 photos of handwritten notes or slides.</p>
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple
            accept="application/pdf,image/*,.txt,.md,.markdown,.tex,.csv"
            onChange={(e) => void fromFiles([...(e.target.files ?? [])])}
          />
          <button type="button" className="btn btn-primary" disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}>
            {busy ?? "Choose files"}
          </button>
          <p className="small faint">PDFs are read in your browser. Photos are transcribed by your connected AI.</p>
        </div>
      )}

      {mode === "topic" && (
        <form className="stack" onSubmit={(e) => (e.preventDefault(), topic.trim().length >= 2 && open(createFromTopic(topic, target, level)))}>
          <input className="input" placeholder="e.g. The Krebs cycle, Supply and demand, Derivatives of trig functions" value={topic} maxLength={300} onChange={(e) => setTopic(e.target.value)} aria-label="Topic" />
          <div className="spread">
            <div className="pills" role="group" aria-label="Level">
              <button type="button" className="pill" aria-pressed={level === "intro"} onClick={() => setLevel("intro")}>New to it</button>
              <button type="button" className="pill" aria-pressed={level === "exam"} onClick={() => setLevel("exam")}>Studying for a test</button>
            </div>
            <button className="btn btn-primary" disabled={topic.trim().length < 2}>Research and start</button>
          </div>
          <p className="small faint">Mullwell searches the web, writes a primer with sources, then quizzes you on it. Sets made this way are labelled “From the web”.</p>
        </form>
      )}

      {mode === "lecture" && (
        <div className="stack">
          {!canTranscribe() && <p className="notice">This browser can&apos;t transcribe speech. Use Chrome, Edge or Safari, or paste a transcript.</p>}
          <div className="row">
            <button type="button" className={`btn ${listening ? "" : "btn-primary"}`} onClick={toggleLecture} disabled={!canTranscribe()}>
              {listening ? "Stop listening" : text ? "Keep listening" : "Start listening"}
            </button>
            {listening && <span className="small muted pulse">Listening. Keep this tab open.</span>}
          </div>
          <textarea className="textarea" rows={6} value={text + (interim ? ` ${interim}` : "")} onChange={(e) => setText(e.target.value)} placeholder="The transcript appears here as the lecture goes. You can edit it." aria-label="Lecture transcript" />
          <div className="spread">
            <span className="small faint">Transcribed by your browser. No audio is saved.</span>
            <button type="button" className="btn btn-primary" disabled={!text.trim() || listening} onClick={() => fromText(text, `Lecture ${new Date().toLocaleDateString()}`)}>
              Make a set from this
            </button>
          </div>
        </div>
      )}

      {error && <p className="notice notice-bad" role="alert">{error}</p>}
    </section>
  );
}
