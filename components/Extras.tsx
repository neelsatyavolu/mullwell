"use client";
import { useEffect, useRef, useState } from "react";
import { useMermaid } from "./useMermaid";
import { generateMap, generatePodcast, useJob } from "@/lib/client/jobs";
import type { StudySet } from "@/lib/study/types";

// On-demand extras: a two-host audio recap read by the browser's own voices,
// and a concept map drawn with Mermaid. Neither is made until asked for.

function pickVoices(): [SpeechSynthesisVoice | null, SpeechSynthesisVoice | null] {
  const lang = (navigator.language || "en").slice(0, 2);
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith(lang));
  const good = voices.filter((v) => /natural|premium|enhanced|google/i.test(v.name));
  const pool = good.length >= 2 ? good : voices;
  return [pool[0] ?? null, pool.find((v) => v !== pool[0]) ?? pool[0] ?? null];
}

export function AudioRecap({ set }: { set: StudySet }) {
  const job = useJob(set.id, "podcast");
  const [playing, setPlaying] = useState<number | null>(null);
  const [rate, setRate] = useState(1);
  const lines = set.podcast ?? [];
  const stopped = useRef(true);

  useEffect(() => () => speechSynthesis.cancel(), []);

  function speakFrom(index: number) {
    speechSynthesis.cancel();
    if (index >= lines.length) return setPlaying(null);
    stopped.current = false;
    const [a, b] = pickVoices();
    const u = new SpeechSynthesisUtterance(lines[index].line);
    u.voice = lines[index].host === "A" ? a : b;
    u.pitch = lines[index].host === "A" ? 1 : 1.15;
    u.rate = rate;
    u.onend = () => !stopped.current && speakFrom(index + 1);
    setPlaying(index);
    speechSynthesis.speak(u);
  }

  function stop() {
    stopped.current = true;
    speechSynthesis.cancel();
    setPlaying(null);
  }

  if (!lines.length) {
    return (
      <div className="card stack">
        <h3 className="heading">Audio recap</h3>
        <p className="muted">A short two-voice conversation about this material, read aloud by your device. Good for a walk or the bus.</p>
        {job.error && <p className="notice notice-bad">{job.error}</p>}
        <div><button className="btn btn-primary" disabled={job.running} onClick={() => void generatePodcast(set.id)}>{job.running ? "Writing the script…" : "Make an audio recap"}</button></div>
      </div>
    );
  }
  return (
    <div className="card stack">
      <div className="spread">
        <h3 className="heading">Audio recap</h3>
        <div className="row">
          <select className="select" style={{ width: "auto", padding: "4px 8px" }} value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="Speed">
            {[0.9, 1, 1.15, 1.3, 1.5].map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
          {playing === null ? (
            <button className="btn btn-primary btn-sm" onClick={() => speakFrom(0)} disabled={job.running}>Play</button>
          ) : (
            <button className="btn btn-sm" onClick={stop}>Stop</button>
          )}
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {lines.map((l, i) => (
          <button key={i} type="button" className="choice" aria-pressed={playing === i} onClick={() => speakFrom(i)} style={{ padding: "8px 12px" }}>
            <span className="choice-key">{l.host === "A" ? "M" : "S"}</span>
            <span className="small">{l.line}</span>
          </button>
        ))}
        {job.running && <p className="small muted pulse">Still writing…</p>}
      </div>
      <p className="small faint">Voices come from your device. M is the host, S is the student.</p>
    </div>
  );
}

export function ConceptMap({ set }: { set: StudySet }) {
  const job = useJob(set.id, "map");
  const { svg, failed } = useMermaid(set.map);

  return (
    <div className="card stack">
      <div className="spread">
        <h3 className="heading">Concept map</h3>
        {set.map && <button className="btn btn-sm btn-ghost" disabled={job.running} onClick={() => void generateMap(set.id)}>Redraw</button>}
      </div>
      {!set.map && <p className="muted">How the main ideas connect, as a diagram. Drawn from this material only.</p>}
      {job.error && <p className="notice notice-bad">{job.error}</p>}
      {failed && <p className="notice">The map couldn&apos;t be drawn. Try Redraw.</p>}
      {svg && !failed && <div className="mermaid-wrap" dangerouslySetInnerHTML={{ __html: svg }} />}
      {!set.map && <div><button className="btn btn-primary" disabled={job.running} onClick={() => void generateMap(set.id)}>{job.running ? "Drawing…" : "Draw a concept map"}</button></div>}
    </div>
  );
}
