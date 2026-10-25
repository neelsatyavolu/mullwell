import { afterEach, describe, expect, it, vi } from "vitest";
import { streamModel, upstreamError, type StreamParams } from "./stream";

const params: StreamParams = {
  provider: "codex",
  tokens: { accessToken: "tok", refreshToken: "r", expiresAt: Date.now() + 1e6, accountId: "acct" },
  model: "gpt-6-luna",
  system: "sys",
  messages: [{ role: "user", content: "hi" }],
  effort: "low",
  search: false,
};

function sse(events: object[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

async function lines(stream: ReadableStream<Uint8Array>) {
  return (await new Response(stream).text()).trim().split("\n").map((l) => JSON.parse(l));
}

afterEach(() => vi.unstubAllGlobals());

describe("streamModel", () => {
  it("relays text deltas then done, sending the Codex headers and instructions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse([
      { type: "response.output_text.delta", delta: "Hel" },
      { type: "response.output_text.delta", delta: "lo" },
      { type: "response.completed", response: {} },
    ]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await lines(streamModel(params))).toEqual([{ t: "Hel" }, { t: "lo" }, { done: true }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("chatgpt.com/backend-api/codex/responses");
    expect(init.headers["chatgpt-account-id"]).toBe("acct");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: "gpt-6-luna", instructions: "sys", store: false, stream: true, reasoning: { effort: "low" } });
    expect(body.tools).toBeUndefined();
  });

  it("puts the system prompt first for Grok and enables search when asked", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse([{ type: "response.completed", response: { citations: ["https://example.org/a"] } }]));
    vi.stubGlobal("fetch", fetchMock);
    const out = await lines(streamModel({ ...params, provider: "grok", model: "grok-4.7", search: true }));
    expect(out).toEqual([{ src: [{ url: "https://example.org/a", title: null }] }, { done: true }]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input[0]).toEqual({ role: "system", content: "sys" });
    expect(body.tools).toEqual([{ type: "web_search" }]);
  });

  it("retries without effort when the backend rejects it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Unsupported reasoning effort" } }), { status: 400 }))
      .mockResolvedValueOnce(sse([{ type: "response.output_text.delta", delta: "ok" }, { type: "response.completed", response: {} }]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await lines(streamModel(params))).toEqual([{ t: "ok" }, { done: true }]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).reasoning).toBeUndefined();
  });

  it("reports upstream failures as an error line", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    expect(await lines(streamModel(params))).toEqual([{ e: "Your AI connection expired. Reconnect it in Settings." }]);
  });

  it("reports a stream that ends without completing as an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sse([{ type: "response.output_text.delta", delta: "par" }])));
    expect(await lines(streamModel(params))).toEqual([{ t: "par" }, { e: "The model stopped before finishing. Try again." }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sse([{ type: "response.incomplete", response: {} }])));
    expect((await lines(streamModel(params)))[0].e).toMatch(/cut off/);
  });

  it("sends images as input_image parts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse([{ type: "response.completed", response: {} }]));
    vi.stubGlobal("fetch", fetchMock);
    await lines(streamModel({ ...params, messages: [{ role: "user", content: "read", images: ["data:image/png;base64,AA"] }] }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input[0].content).toEqual([{ type: "input_text", text: "read" }, { type: "input_image", image_url: "data:image/png;base64,AA" }]);
  });
});

it("upstreamError", () => {
  expect(upstreamError(500, '{"detail":"boom"}')).toBe("boom");
  expect(upstreamError(429, "")).toMatch(/rate limit/);
  expect(upstreamError(502, "")).toBe("The model request failed (HTTP 502).");
});
