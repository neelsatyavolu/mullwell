import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// The browser-side half of a Xanom sign-in: state, PKCE verifier and nonce,
// kept in a short-lived signed cookie between /api/xanom/start and the callback.

export const FLOW_COOKIE = "mw_xanom_flow";
export const FLOW_TTL_MS = 10 * 60_000;

export const INTENTS = ["signin", "link", "convert"] as const;
export type Intent = (typeof INTENTS)[number];

export type XanomConfig = { issuer: string; clientId: string; clientSecret: string };

export type Flow = {
  state: string;
  verifier: string;
  nonce: string;
  intent: Intent;
  /** Same-site path to land on afterwards. */
  returnTo: string;
  /** Who was signed in at the start (link and convert only); the callback must see the same account. */
  userId: string | null;
  expiresAt: number;
};

const random = () => randomBytes(32).toString("base64url");
const mac = (key: Buffer, value: string) => createHmac("sha256", key).update(`xanom-flow:${value}`).digest("base64url");

export const isIntent = (value: string | null): value is Intent => INTENTS.includes(value as Intent);

/** Only same-site paths are followed afterwards. */
export function safeReturn(path: string | null, fallback = "/"): string {
  // URL parsing drops tabs and newlines, so "/\n/evil.com" would become "//evil.com": refuse control characters outright.
  if (!path || path.length > 500 || /[\u0000-\u001f\u007f\\]/.test(path) || !path.startsWith("/") || path.startsWith("//")) return fallback;
  const base = "https://mullwell.invalid";
  const parsed = new URL(path, base);
  return parsed.origin === base ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
}

export function newFlow(input: { intent: Intent; returnTo: string; userId: string | null; now: number }): Flow {
  return { state: random(), verifier: random(), nonce: random(), intent: input.intent, returnTo: input.returnTo, userId: input.userId, expiresAt: input.now + FLOW_TTL_MS };
}

export const codeChallenge = (verifier: string): string => createHash("sha256").update(verifier).digest("base64url");

export function sealFlow(key: Buffer, flow: Flow): string {
  const body = Buffer.from(JSON.stringify(flow)).toString("base64url");
  return `${body}.${mac(key, body)}`;
}

/** The flow a cookie holds, or null when it is forged, malformed or expired. */
export function openFlow(key: Buffer, cookie: string | undefined, now: number): Flow | null {
  if (!cookie || cookie.length > 2000) return null;
  const [body, given, extra] = cookie.split(".");
  if (!body || !given || extra !== undefined) return null;
  if (!sameString(given, mac(key, body))) return null;
  try {
    const flow = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Flow;
    if (!isIntent(flow.intent) || typeof flow.state !== "string" || typeof flow.verifier !== "string" || typeof flow.nonce !== "string") return null;
    return now < flow.expiresAt ? flow : null;
  } catch {
    return null;
  }
}

export function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function authorizeUrl(config: XanomConfig, flow: Flow, redirectUri: string, extra: { convert?: string; loginHint?: string } = {}): string {
  const url = new URL("/oauth/authorize", config.issuer);
  const params: Record<string, string | undefined> = {
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: "openid email profile",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: codeChallenge(flow.verifier),
    code_challenge_method: "S256",
    login_hint: extra.loginHint,
    convert: extra.convert,
  };
  for (const [name, value] of Object.entries(params)) if (value) url.searchParams.set(name, value);
  return url.toString();
}

export const redirectUriFor = (appUrl: string): string => new URL("/api/xanom/callback", appUrl).toString();
