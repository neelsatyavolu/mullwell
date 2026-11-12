import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, SignJWT, decodeProtectedHeader, type JWK, type JWTVerifyGetKey } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { convertTicket, exchangeCode, verifyIdToken, verifySummaryToken, XANOM_AUDIENCE } from "./tokens";

// A fake issuer: an RS256 key pair and its JWKS, standing in for accounts.xanom.co.
const config = { issuer: "https://accounts.xanom.co", clientId: "mullwell", clientSecret: "test-client-secret-0123456789" };
let privateKey: CryptoKey;
let keys: JWTVerifyGetKey;
let otherKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  keys = createLocalJWKSet({ keys: [jwk] });
  otherKey = (await generateKeyPair("RS256")).privateKey;
});

const now = () => Math.floor(Date.now() / 1000);

function sign(claims: Record<string, unknown>, opts: { key?: CryptoKey; iat?: number; exp?: number; aud?: string; iss?: string } = {}) {
  const iat = opts.iat ?? now();
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opts.iss ?? config.issuer)
    .setAudience(opts.aud ?? config.clientId)
    .setIssuedAt(iat)
    .setExpirationTime(opts.exp ?? iat + 600)
    .sign(opts.key ?? privateKey);
}

const idClaims = { sub: "xa_01", email: "Ada@Example.com", email_verified: true, name: "Ada", nonce: "n1" };

describe("id_token", () => {
  it("accepts a good token and lowercases the email", async () => {
    expect(await verifyIdToken(config, await sign(idClaims), "n1", keys)).toEqual({ sub: "xa_01", email: "ada@example.com", name: "Ada" });
  });

  it("rejects a wrong nonce, audience, issuer, signature, expiry or unverified email", async () => {
    await expect(verifyIdToken(config, await sign(idClaims), "other", keys)).rejects.toThrow();
    await expect(verifyIdToken(config, await sign(idClaims, { aud: "strix" }), "n1", keys)).rejects.toThrow();
    await expect(verifyIdToken(config, await sign(idClaims, { iss: "https://evil.example" }), "n1", keys)).rejects.toThrow();
    await expect(verifyIdToken(config, await sign(idClaims, { key: otherKey }), "n1", keys)).rejects.toThrow();
    await expect(verifyIdToken(config, await sign(idClaims, { iat: now() - 1200, exp: now() - 600 }), "n1", keys)).rejects.toThrow();
    await expect(verifyIdToken(config, await sign({ ...idClaims, email_verified: false }), "n1", keys)).rejects.toThrow();
  });
});

describe("code exchange", () => {
  it("posts the code, verifier and client credentials and returns the id_token", async () => {
    let sent: URLSearchParams | null = null;
    const fake = (async (url: URL, init: RequestInit) => {
      expect(String(url)).toBe("https://accounts.xanom.co/oauth/token");
      sent = init.body as URLSearchParams;
      return new Response(JSON.stringify({ id_token: "ID", access_token: "A", token_type: "Bearer", expires_in: 600 }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await exchangeCode(config, { code: "c", verifier: "v", redirectUri: "https://mullwell.xanom.co/api/xanom/callback" }, fake)).toBe("ID");
    expect(Object.fromEntries(sent!)).toMatchObject({ grant_type: "authorization_code", code: "c", code_verifier: "v", client_id: "mullwell", client_secret: config.clientSecret });
  });

  it("throws on an error response", async () => {
    const fake = (async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as unknown as typeof fetch;
    await expect(exchangeCode(config, { code: "c", verifier: "v", redirectUri: "r" }, fake)).rejects.toThrow();
  });
});

describe("convert ticket", () => {
  it("is an HS256 JWT keyed with the client secret, with the spec's claims and a 5 minute life", async () => {
    const at = Date.UTC(2026, 10, 12);
    const ticket = await convertTicket(config, { email: "ada@example.com", name: "ada", emailVerified: false, now: at });
    expect(decodeProtectedHeader(ticket)).toEqual({ alg: "HS256", typ: "JWT" });
    const { payload } = await jwtVerify(ticket, new TextEncoder().encode(config.clientSecret), {
      issuer: "mullwell", audience: XANOM_AUDIENCE, currentDate: new Date(at + 1000),
    });
    expect(payload).toMatchObject({ email: "ada@example.com", name: "ada", email_verified: false, iat: at / 1000, exp: at / 1000 + 300 });
    expect(typeof payload.jti).toBe("string");
    await expect(jwtVerify(ticket, new TextEncoder().encode("wrong-secret-0123456789"))).rejects.toThrow();
    const again = await convertTicket(config, { email: "ada@example.com", name: "ada", emailVerified: false, now: at });
    expect((await jwtVerify(again, new TextEncoder().encode(config.clientSecret), { currentDate: new Date(at) })).payload.jti).not.toBe(payload.jti);
  });
});

describe("summary token", () => {
  const summary = { sub: "xa_01", scope: "summary" };
  it("accepts a good token", async () => {
    expect(await verifySummaryToken(config, `Bearer ${await sign(summary, { exp: now() + 60 })}`, keys)).toBe("xa_01");
  });

  it("rejects missing, unsigned, wrong-aud, expired, bad-signature and wrong-scope tokens", async () => {
    await expect(verifySummaryToken(config, null, keys)).rejects.toThrow();
    const unsigned = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ ...summary, iss: config.issuer, aud: "mullwell", exp: now() + 60 })).toString("base64url")}.`;
    await expect(verifySummaryToken(config, `Bearer ${unsigned}`, keys)).rejects.toThrow();
    await expect(verifySummaryToken(config, `Bearer ${await sign(summary, { aud: "tare" })}`, keys)).rejects.toThrow();
    await expect(verifySummaryToken(config, `Bearer ${await sign(summary, { iat: now() - 120, exp: now() - 60 })}`, keys)).rejects.toThrow();
    await expect(verifySummaryToken(config, `Bearer ${await sign(summary, { key: otherKey })}`, keys)).rejects.toThrow();
    await expect(verifySummaryToken(config, `Bearer ${await sign({ sub: "xa_01", scope: "openid" })}`, keys)).rejects.toThrow();
    // A token issued long ago but with a far-off exp is still refused (summary tokens live 60 s).
    await expect(verifySummaryToken(config, `Bearer ${await sign(summary, { iat: now() - 600, exp: now() + 600 })}`, keys)).rejects.toThrow();
  });
});
