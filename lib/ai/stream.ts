import "server-only";
import { createSseSplitter, responsesEvent, type Source } from "./sse";
import type { Provider, Tokens } from "./providers";

// Streams a model response from the student's own subscription as NDJSON lines:
// {"t":"text chunk"} … then {"done":true} or {"e":"error message"}. Along the
// way {"s":"status"} while the model searches the web and, at the end,
// {"src":[…]} for the pages it cited.

const CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";
const GROK_RESPONSES_URL = "https://api.x.ai/v1/responses";
const IDLE_TIMEOUT_MS = 90_000;
const MAX_SOURCES = 12;

const HOSTED_SEARCH: Record<Provider, object[]> = {
  codex: [{ type: "web_search", external_web_access: true }],
  grok: [{ type: "web_search" }],
};

export type Effort = "low" | "medium" | "high";

/** `images` are data URLs attached to a user message (photos of notes). */
export type ChatMessage = { role: "user" | "assistant"; content: string; images?: string[] };

export type StreamParams = {
  provider: Provider;
  tokens: Tokens;
  model: string;
  system: string;
  messages: ChatMessage[];
  effort: Effort;
  search: boolean;
};

type Attempt = { effort: Effort | null; search: boolean };

function userContent(m: ChatMessage): object[] {
  const images = (m.images ?? []).map((image_url) => ({ type: "input_image", image_url }));
  return [...(m.content ? [{ type: "input_text", text: m.content }] : []), ...images];
}

function input({ provider, system, messages }: StreamParams): object[] {
  const items = messages.map((m) =>
    m.role === "assistant"
      ? { role: "assistant", content: provider === "grok" ? m.content : [{ type: "output_text", text: m.content }] }
      : { role: "user", content: provider === "grok" && !m.images?.length ? m.content : userContent(m) },
  );
  return provider === "grok" ? [{ role: "system", content: system }, ...items] : items;
}

function sharedBody(params: StreamParams, attempt: Attempt) {
  return {
    model: params.model,
    input: input(params),
    ...(attempt.search ? { tools: HOSTED_SEARCH[params.provider] } : {}),
    store: false,
    stream: true,
  };
}

function codexRequest(params: StreamParams, attempt: Attempt): [string, RequestInit] {
  const { tokens, system } = params;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${tokens.accessToken}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    originator: "codex_cli_rs",
    "OpenAI-Beta": "responses=v1",
  };
  if (tokens.accountId) headers["chatgpt-account-id"] = tokens.accountId;
  const body = {
    ...sharedBody(params, attempt),
    instructions: system,
    ...(attempt.effort ? { reasoning: { effort: attempt.effort } } : {}),
  };
  return [CODEX_RESPONSES_URL, { method: "POST", headers, body: JSON.stringify(body) }];
}

function grokRequest(params: StreamParams, attempt: Attempt): [string, RequestInit] {
  const body = {
    ...sharedBody(params, attempt),
    temperature: 0.3,
    ...(attempt.effort && /^grok-4/.test(params.model) ? { reasoning: { effort: attempt.effort } } : {}),
  };
  return [
    GROK_RESPONSES_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.tokens.accessToken}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "User-Agent": "grok-cli/1.0",
      },
      body: JSON.stringify(body),
    },
  ];
}

export function upstreamError(status: number, text: string): string {
  try {
    const json = JSON.parse(text);
    const message = json?.error?.message ?? json?.detail ?? json?.message;
    if (typeof message === "string" && message) return message;
  } catch {
    /* not JSON */
  }
  if (status === 401 || status === 403) return "Your AI connection expired. Reconnect it in Settings.";
  if (status === 429) return "Your subscription's rate limit was hit. Try again in a moment.";
  return `The model request failed (HTTP ${status}).`;
}

type Io = { send: (line: object) => void; signal: AbortSignal; alive: () => void; closed: () => boolean; reading: (r: ReadableStreamDefaultReader<Uint8Array>) => void };

/** If the backend rejects the effort level or web search for this model/plan, drop that option and retry. */
async function open(params: StreamParams, io: Io): Promise<{ body: ReadableStream<Uint8Array> } | { error: string }> {
  const build = params.provider === "codex" ? codexRequest : grokRequest;
  let attempt: Attempt = { effort: params.effort, search: params.search };
  let failure = "The model request failed.";
  for (let tries = 0; tries < 3; tries++) {
    const [url, init] = build(params, attempt);
    const res = await fetch(url, { ...init, signal: io.signal });
    if (res.ok && res.body) return { body: res.body };
    const text = await res.text().catch(() => "");
    failure = upstreamError(res.status, text);
    if (res.status !== 400) break;
    if (attempt.effort && /effort|reasoning/i.test(text)) attempt = { ...attempt, effort: null };
    else if (attempt.search && /search|tool/i.test(text)) attempt = { ...attempt, search: false };
    else break;
  }
  return { error: failure };
}

function uniqueSources(sources: Source[]): Source[] {
  const byUrl = new Map<string, Source>();
  for (const s of sources) if (!byUrl.get(s.url)?.title) byUrl.set(s.url, s);
  return [...byUrl.values()].slice(0, MAX_SOURCES);
}

async function relay(params: StreamParams, io: Io): Promise<string | null> {
  io.alive();
  const opened = await open(params, io);
  if ("error" in opened) return opened.error;
  let sources: Source[] = [];
  let error: string | null = null;
  let ended = false;
  const splitter = createSseSplitter((data) => {
    const event = responsesEvent(data);
    if (!event || ended) return;
    if (event.text) io.send({ t: event.text });
    if (event.status) io.send({ s: event.status });
    if (event.sources) sources = [...sources, ...event.sources];
    if (event.error) error = event.error;
    ended = Boolean(event.error || event.done);
  });
  const decoder = new TextDecoder();
  const reader = opened.body.getReader();
  io.reading(reader);
  for (;;) {
    const { value, done } = await reader.read();
    if (done || io.closed()) break;
    io.alive();
    splitter.push(decoder.decode(value, { stream: true }));
    if (ended) {
      reader.cancel().catch(() => {});
      break;
    }
  }
  splitter.flush();
  if (io.closed()) return null;
  if (!error && !ended) return "The model stopped before finishing. Try again.";
  if (sources.length) io.send({ src: uniqueSources(sources) });
  return error;
}

export function streamModel(params: StreamParams): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const upstream = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let closed = false;
  let timedOut = false;
  let idle: ReturnType<typeof setTimeout> | undefined;
  // Long answers are fine as long as tokens keep arriving; only silence times out.
  const armIdle = () => {
    clearTimeout(idle);
    idle = setTimeout(() => {
      timedOut = true;
      upstream.abort();
    }, IDLE_TIMEOUT_MS);
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: object) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          closed = true;
        }
      };
      const io: Io = { send, signal: upstream.signal, alive: armIdle, closed: () => closed, reading: (r) => (reader = r) };
      try {
        const error = await relay(params, io);
        send(error ? { e: error } : { done: true });
      } catch (err) {
        if (!closed) {
          console.error(`[ai] ${params.provider} stream failed`, err instanceof Error ? err.message : err);
          send({ e: timedOut ? "The model stopped responding." : "Could not reach the model." });
        }
      } finally {
        clearTimeout(idle);
      }
      if (!closed) {
        closed = true;
        controller.close();
      }
    },
    // The browser went away: stop generating on the student's quota.
    cancel() {
      closed = true;
      clearTimeout(idle);
      upstream.abort();
      reader?.cancel().catch(() => {});
    },
  });
}
