import { randomUUID } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";
import type { XanomConfig } from "./flow";

// Talking to accounts.xanom.co: the code exchange, id_token checks, the
// convert ticket we sign, and the summary token it signs.

export const XANOM_AUDIENCE = "https://accounts.xanom.co";
const TICKET_TTL_S = 300;

export type XanomClaims = { sub: string; email: string; name: string | null };

// jose caches fetched keys (and refetches on an unknown kid); keep them for 10 minutes.
const keySets = new Map<string, JWTVerifyGetKey>();
export function remoteKeys(issuer: string): JWTVerifyGetKey {
  let keys = keySets.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL("/oauth/jwks", issuer), { cacheMaxAge: 10 * 60_000, timeoutDuration: 3000 });
    keySets.set(issuer, keys);
  }
  return keys;
}

/** Swaps the authorization code for an id_token. Throws on any failure. */
export async function exchangeCode(
  config: XanomConfig,
  input: { code: string; verifier: string; redirectUri: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(new URL("/oauth/token", config.issuer), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.verifier,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const json = (await res.json().catch(() => null)) as { id_token?: unknown } | null;
  if (!res.ok || typeof json?.id_token !== "string") throw new Error(`Token exchange failed (${res.status})`);
  return json.id_token;
}

/** Checks signature, issuer, audience, expiry, nonce and a verified email. */
export async function verifyIdToken(config: XanomConfig, idToken: string, nonce: string, keys: JWTVerifyGetKey): Promise<XanomClaims> {
  const { payload } = await jwtVerify(idToken, keys, { issuer: config.issuer, audience: config.clientId, algorithms: ["RS256"], requiredClaims: ["sub", "exp", "iat"] });
  if (payload.nonce !== nonce) throw new Error("id_token nonce mismatch");
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("id_token has no sub");
  if (typeof payload.email !== "string" || payload.email_verified !== true) throw new Error("id_token has no verified email");
  return { sub: payload.sub, email: payload.email.trim().toLowerCase(), name: typeof payload.name === "string" ? payload.name : null };
}

/** The HS256 convert ticket (SPEC §3), keyed with the client secret. */
export function convertTicket(config: XanomConfig, input: { email: string; name: string; emailVerified: boolean; now: number }): Promise<string> {
  const iat = Math.floor(input.now / 1000);
  return new SignJWT({ email: input.email, name: input.name, email_verified: input.emailVerified })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(config.clientId)
    .setAudience(XANOM_AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt(iat)
    .setExpirationTime(iat + TICKET_TTL_S)
    .sign(new TextEncoder().encode(config.clientSecret));
}

/** The Xanom account a summary request is for. Throws unless the bearer token is a live, signed summary token for this app. */
export async function verifySummaryToken(config: Pick<XanomConfig, "issuer" | "clientId">, authorization: string | null, keys: JWTVerifyGetKey): Promise<string> {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) throw new Error("No bearer token");
  const { payload } = await jwtVerify(token, keys, { issuer: config.issuer, audience: config.clientId, algorithms: ["RS256"], requiredClaims: ["sub", "exp", "iat"], maxTokenAge: "70s" });
  if (payload.scope !== "summary" || typeof payload.sub !== "string") throw new Error("Not a summary token");
  return payload.sub;
}
