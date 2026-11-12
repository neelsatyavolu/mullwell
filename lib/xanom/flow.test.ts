import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sessionKey } from "../account/session";
import { authorizeUrl, codeChallenge, FLOW_TTL_MS, newFlow, openFlow, redirectUriFor, safeReturn, sealFlow } from "./flow";

const key = sessionKey("a-long-enough-test-secret");
const config = { issuer: "https://accounts.xanom.co", clientId: "mullwell", clientSecret: "s".repeat(32) };

describe("xanom flow cookie", () => {
  it("round-trips a sealed flow until it expires", () => {
    const flow = newFlow({ intent: "link", returnTo: "/settings", userId: "u1", now: 1000 });
    const sealed = sealFlow(key, flow);
    expect(openFlow(key, sealed, 2000)).toEqual(flow);
    expect(openFlow(key, sealed, 1000 + FLOW_TTL_MS)).toBeNull();
  });

  it("rejects a tampered, foreign-key or malformed cookie", () => {
    const sealed = sealFlow(key, newFlow({ intent: "signin", returnTo: "/", userId: null, now: 1000 }));
    const [body, mac] = sealed.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), intent: "convert" })).toString("base64url");
    expect(openFlow(key, `${forged}.${mac}`, 2000)).toBeNull();
    expect(openFlow(sessionKey("another-long-test-secret"), sealed, 2000)).toBeNull();
    expect(openFlow(key, undefined, 2000)).toBeNull();
    expect(openFlow(key, "garbage", 2000)).toBeNull();
    expect(openFlow(key, `${sealed}.extra`, 2000)).toBeNull();
  });

  it("makes fresh random state, verifier and nonce each time", () => {
    const a = newFlow({ intent: "signin", returnTo: "/", userId: null, now: 0 });
    const b = newFlow({ intent: "signin", returnTo: "/", userId: null, now: 0 });
    expect(a.state).not.toBe(b.state);
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.verifier.length).toBeGreaterThanOrEqual(43);
  });
});

describe("authorize URL", () => {
  it("carries state, nonce and an S256 PKCE challenge", () => {
    const flow = newFlow({ intent: "convert", returnTo: "/settings", userId: "u1", now: 0 });
    const url = new URL(authorizeUrl(config, flow, redirectUriFor("https://mullwell.xanom.co"), { convert: "T", loginHint: "a@b.co" }));
    expect(url.origin + url.pathname).toBe("https://accounts.xanom.co/oauth/authorize");
    const p = url.searchParams;
    expect(p.get("response_type")).toBe("code");
    expect(p.get("client_id")).toBe("mullwell");
    expect(p.get("redirect_uri")).toBe("https://mullwell.xanom.co/api/xanom/callback");
    expect(p.get("scope")).toBe("openid email profile");
    expect(p.get("state")).toBe(flow.state);
    expect(p.get("nonce")).toBe(flow.nonce);
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("code_challenge")).toBe(createHash("sha256").update(flow.verifier).digest("base64url"));
    expect(p.get("code_challenge")).toBe(codeChallenge(flow.verifier));
    expect(p.get("convert")).toBe("T");
    expect(p.get("login_hint")).toBe("a@b.co");
  });

  it("follows only same-site return paths", () => {
    expect(safeReturn("/set/abc?x=1")).toBe("/set/abc?x=1");
    expect(safeReturn("//evil.com")).toBe("/");
    expect(safeReturn("https://evil.com")).toBe("/");
    expect(safeReturn("/\\evil.com")).toBe("/");
    expect(safeReturn(null, "/settings")).toBe("/settings");
    expect(safeReturn("/\n/evil.example")).toBe("/");
    expect(safeReturn("/\t/evil.example")).toBe("/");
  });
});
