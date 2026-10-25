import "server-only";
import { cookies } from "next/headers";
import { type Provider, type Tokens, refreshTokens } from "./providers";
import { deriveKey, seal, unseal } from "./seal";

// Provider tokens live in this browser's httpOnly cookies, encrypted (AES-GCM)
// and bound to the signed-in account, so another account on the same browser
// can't use them. They are never written to the database. Tokens can exceed a
// single cookie's size, so they are chunked. Every cookie is scoped to /api/ai
// so pages and assets never carry them.

const SESSION_TTL_DAYS = 30;
const PKCE_TTL_SECONDS = 10 * 60;
const CHUNK_SIZE = 3500;
const MAX_CHUNKS = 6;

const COOKIE_PATH = "/api/ai";
const sessionPrefix = (p: Provider) => `${p}_s`;
const pkceCookie = (p: Provider) => `${p}_pkce`;

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: COOKIE_PATH,
  maxAge,
});

let cachedKey: Buffer | null = null;
function key(): Buffer {
  const secret = process.env.MULLWELL_SECRET;
  if (!secret) throw new Error("MULLWELL_SECRET is not set");
  cachedKey ??= deriveKey(secret, "ai-session-cookies");
  return cachedKey;
}

type PkceCookie = { verifier: string; state: string };

export async function writePkce(provider: Provider, value: PkceCookie): Promise<void> {
  const jar = await cookies();
  jar.set(pkceCookie(provider), seal(key(), JSON.stringify(value), `${provider}:pkce`), cookieOptions(PKCE_TTL_SECONDS));
}

export async function readPkce(provider: Provider): Promise<PkceCookie | null> {
  const jar = await cookies();
  const sealed = jar.get(pkceCookie(provider))?.value;
  const raw = sealed ? unseal(key(), sealed, `${provider}:pkce`) : null;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.verifier === "string" && typeof parsed.state === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function clearPkce(provider: Provider): Promise<void> {
  const jar = await cookies();
  jar.delete({ name: pkceCookie(provider), path: COOKIE_PATH });
}

function chunkString(s: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

type StoredSession = Tokens & { owner: string };
const sessionAad = (provider: Provider, owner: string) => `${provider}:${owner}`;

export async function writeSession(provider: Provider, owner: string, tokens: Tokens): Promise<void> {
  const json = JSON.stringify({ ...tokens, owner } satisfies StoredSession);
  const chunks = chunkString(seal(key(), json, sessionAad(provider, owner)), CHUNK_SIZE);
  if (chunks.length > MAX_CHUNKS) throw new Error(`${provider} session too large to fit in ${MAX_CHUNKS} cookies.`);
  const jar = await cookies();
  const opts = cookieOptions(SESSION_TTL_DAYS * 24 * 60 * 60);
  const prefix = sessionPrefix(provider);
  chunks.forEach((chunk, i) => jar.set(`${prefix}_${i}`, chunk, opts));
  for (let i = chunks.length; i < MAX_CHUNKS; i++) jar.delete({ name: `${prefix}_${i}`, path: COOKIE_PATH });
}

export async function clearAllSessions(): Promise<void> {
  for (const p of ["codex", "grok"] as const) {
    await clearSession(p);
    await clearPkce(p);
  }
}

export async function clearSession(provider: Provider): Promise<void> {
  const jar = await cookies();
  const prefix = sessionPrefix(provider);
  for (let i = 0; i < MAX_CHUNKS; i++) jar.delete({ name: `${prefix}_${i}`, path: COOKIE_PATH });
}

async function readSessionRaw(provider: Provider, owner: string): Promise<Tokens | null> {
  const jar = await cookies();
  let sealed = "";
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const v = jar.get(`${sessionPrefix(provider)}_${i}`)?.value;
    if (!v) break;
    sealed += v;
  }
  const joined = sealed ? unseal(key(), sealed, sessionAad(provider, owner)) : null;
  if (!joined) return null;
  try {
    const parsed = JSON.parse(joined) as Partial<StoredSession>;
    if (typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string" || parsed.owner !== owner) return null;
    return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken, expiresAt: Number(parsed.expiresAt), idToken: parsed.idToken, accountId: parsed.accountId };
  } catch {
    return null;
  }
}

/** Presence check only (no refresh), for the status endpoint. */
export async function hasSession(provider: Provider, owner: string): Promise<boolean> {
  return (await readSessionRaw(provider, owner)) !== null;
}

// Several requests from one page (questions plus answer checks) can arrive
// together near expiry. Providers rotate refresh tokens, so only one refresh
// may use a given token; the others reuse its result for a short while.
const REFRESH_REUSE_MS = 2 * 60_000;
const refreshes = new Map<string, { at: number; result: Promise<Tokens> }>();

function sharedRefresh(provider: Provider, session: Tokens): Promise<Tokens> {
  const now = Date.now();
  for (const [k, v] of refreshes) if (now - v.at > REFRESH_REUSE_MS) refreshes.delete(k);
  const key = `${provider}:${session.refreshToken}`;
  const existing = refreshes.get(key);
  if (existing) return existing.result;
  const result = refreshTokens(provider, session.refreshToken, session);
  refreshes.set(key, { at: now, result });
  result.catch(() => refreshes.delete(key));
  return result;
}

/** A valid token, refreshed (and re-persisted) when near expiry. */
export async function getActiveSession(provider: Provider, owner: string): Promise<Tokens | null> {
  const session = await readSessionRaw(provider, owner);
  if (!session) return null;
  if (session.expiresAt > Date.now() + 30_000) return session;
  try {
    const refreshed = await sharedRefresh(provider, session);
    await writeSession(provider, owner, refreshed);
    return refreshed;
  } catch (err) {
    console.error(`[ai-session] ${provider} refresh failed:`, err instanceof Error ? err.message : err);
    // Don't clear the cookie here: a parallel request on another server may
    // have just rotated the token and written the new one. If the sign-in was
    // really revoked, every request fails and the student reconnects.
    return null;
  }
}
