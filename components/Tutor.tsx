"use client";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { runTask } from "@/lib/client/ai";
import { contextSections } from "@/lib/client/jobs";
import type { Item, StudySet } from "@/lib/study/types";

// A tutor that knows the set's material. Socratic by default: hints and
// guiding questions before answers.

type Turn = { role: "user" | "assistant"; content: string };
const MAX_TURNS = 30;

function focusText(item: Item | null): string | undefined {
  if (!item) return undefined;
  return `Question: ${item.prompt}\nCorrect answer: ${item.answer}\nSource quote: "${item.quote}" [§${item.section}]`;
}

export function Tutor({ set, focus, onCite }: { set: StudySet; focus: Item | null; onCite: (n: number) => void }) {
  const [mode, setMode] = useState<"socratic" | "direct">("socratic");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState(focus ? "I got this one wrong. Can you help me understand it?" : "");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  // Block body: newer browsers return a Promise from scrollIntoView, which React would treat as the cleanup.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length, streaming]);

  async function send() {
    const text = draft.trim();
    if (!text || streaming !== null) return;
    const next = [...turns, { role: "user" as const, content: text }].slice(-MAX_TURNS);
    setTurns(next);
    setDraft("");
    setError(null);
    setStreaming("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { text: reply } = await runTask(
        "tutor",
        { sections: contextSections(set.sections), mode, focus: focusText(focus), messages: next },
        { onText: (_, all) => setStreaming(all), signal: controller.signal },
      );
      setTurns((t) => [...t, { role: "assistant", content: reply || "…" }]);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "The tutor couldn't answer.");
    } finally {
      setStreaming(null);
    }
  }

  const starters = ["Quiz me on the hardest idea here", "Explain the big picture simply", "What do students usually mix up here?", "Give me a worked example"];

  return (
    <div className="stack">
      <div className="spread">
        <p className="small muted">Answers come from this set&apos;s material, with section citations.</p>
        <div className="pills" role="group" aria-label="Tutor style">
          <button type="button" className="pill" aria-pressed={mode === "socratic"} onClick={() => setMode("socratic")}>Guide me</button>
          <button type="button" className="pill" aria-pressed={mode === "direct"} onClick={() => setMode("direct")}>Just explain</button>
        </div>
      </div>
      {focus && <div className="inset small"><span className="faint">Working on:</span> {focus.prompt}</div>}
      <div className="chat">
        {turns.length === 0 && !focus && (
          <div className="row">
            {starters.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => setDraft(s)}>{s}</button>
            ))}
          </div>
        )}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="bubble-user">{t.content}</div>
          ) : (
            <div key={i} className="bubble-ai"><Markdown text={t.content} onCite={onCite} compact /></div>
          ),
        )}
        {streaming !== null && (
          <div className="bubble-ai">{streaming ? <Markdown text={streaming} onCite={onCite} compact /> : <p className="muted pulse">Thinking…</p>}</div>
        )}
        {error && <p className="notice notice-bad" role="alert">{error}</p>}
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={(e) => (e.preventDefault(), void send())}>
        <textarea
          className="textarea"
          rows={1}
          value={draft}
          placeholder="Ask anything about this material"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), void send())}
          aria-label="Message the tutor"
        />
        {streaming !== null ? (
          <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>Stop</button>
        ) : (
          <button className="btn btn-primary" disabled={!draft.trim()}>Send</button>
        )}
      </form>
    </div>
  );
}
