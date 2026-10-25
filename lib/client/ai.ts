"use client";
import { useSyncExternalStore } from "react";
import { createObjectParser } from "@/lib/study/ndjson";

// Browser side of /api/ai/run: sends a task, reads the NDJSON stream, and
// hands text, status and sources to the caller as they arrive.

export type Provider = "codex" | "grok";
/** The study fields set how big today's session is (see lib/study/today.ts); unset means the default. */
export type Prefs = { provider: Provider; model?: string; studyNewPerDay?: number; studyCap?: number };

export const STUDY_DEFAULTS = { newPerDay: 10, cap: 30 };
export const STUDY_MAX = 100;

const PREFS_KEY = "mullwell.ai";

/** A whole number from `min` to STUDY_MAX, or undefined. */
export function studyLimit(value: unknown, min = 0): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(STUDY_MAX, Math.max(min, Math.round(value))) : undefined;
}

export function readPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
    if (raw && (raw.provider === "codex" || raw.provider === "grok")) {
      return { provider: raw.provider, model: typeof raw.model === "string" ? raw.model : undefined, studyNewPerDay: studyLimit(raw.studyNewPerDay), studyCap: studyLimit(raw.studyCap, 1) };
    }
  } catch {
    /* storage blocked or bad JSON */
  }
  return { provider: "codex" };
}

const prefListeners = new Set<() => void>();
let prefsSnapshot: Prefs | null = null;

export function writePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage blocked */
  }
  prefsSnapshot = prefs;
  for (const l of prefListeners) l();
}

const DEFAULT_PREFS: Prefs = { provider: "codex" };

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      prefListeners.add(l);
      return () => prefListeners.delete(l);
    },
    () => (prefsSnapshot ??= readPrefs()),
    () => DEFAULT_PREFS,
  );
}

export class AiError extends Error {
  constructor(message: string, readonly needsConnect = false) {
    super(message);
  }
}

export type Source = { url: string; title: string | null };
export type RunHandlers = { onText?: (chunk: string, all: string) => void; onStatus?: (status: string) => void; signal?: AbortSignal };

export async function runTask(task: string, input: unknown, handlers: RunHandlers = {}): Promise<{ text: string; sources: Source[] }> {
  const prefs = readPrefs();
  let res: Response;
  try {
    res = await fetch("/api/ai/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: prefs.provider, model: prefs.model, task, input }),
      signal: handlers.signal,
    });
  } catch (err) {
    if (handlers.signal?.aborted) throw err;
    throw new AiError("Couldn't reach Mullwell. Check your connection.");
  }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new AiError(body?.error ?? `Request failed (${res.status}).`, res.status === 401);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let sources: Source[] = [];
  let error: string | null = null;
  let finished = false;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const msg = JSON.parse(line) as { t?: string; s?: string; src?: Source[]; e?: string; done?: boolean };
    if (msg.done) finished = true;
    if (msg.t) {
      text += msg.t;
      handlers.onText?.(msg.t, text);
    }
    if (msg.s) handlers.onStatus?.(msg.s);
    if (msg.src) sources = msg.src;
    if (msg.e) error = msg.e;
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      handle(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 1);
    }
  }
  handle(buffer);
  if (error) throw new AiError(error, /reconnect|connect chatgpt/i.test(error));
  if (!finished) throw new AiError("The connection dropped before the answer finished. Try again.");
  return { text, sources };
}

/** Runs a task whose output is one JSON object per line, calling onObject for each as soon as it's complete. */
export async function runObjects(task: string, input: unknown, onObject: (value: Record<string, unknown>) => void, signal?: AbortSignal): Promise<void> {
  const parser = createObjectParser(onObject);
  await runTask(task, input, { onText: (chunk) => parser.push(chunk), signal });
  parser.flush();
}
