import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { currentUserId, signingKey, startSession } from "@/lib/server/auth";
import { env } from "@/lib/server/env";
import { xanomConfig } from "@/lib/server/xanom";
import { FLOW_COOKIE, openFlow, redirectUriFor, sameString } from "@/lib/xanom/flow";
import { linkXanom } from "@/lib/xanom/link";
import { exchangeCode, remoteKeys, verifyIdToken } from "@/lib/xanom/tokens";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function go(path: string, error?: string) {
  const url = new URL(path, env().APP_URL);
  if (error) url.searchParams.set("xanom_error", error);
  return NextResponse.redirect(url, { status: 303, headers: noStore });
}

// GET /api/xanom/callback?code&state: finish a Xanom sign-in, link or convert.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const jar = await cookies();
  const flow = openFlow(signingKey(), jar.get(FLOW_COOKIE)?.value, Date.now());
  jar.delete({ name: FLOW_COOKIE, path: "/api/xanom" });

  const state = params.get("state");
  if (!flow || !state || !sameString(state, flow.state)) return go("/login", "expired");
  const errorPage = flow.intent === "signin" ? "/login" : "/settings";
  if (params.get("error")) return go(errorPage, params.get("error") === "access_denied" ? "cancelled" : "failed");
  const code = params.get("code");
  const config = xanomConfig();
  if (!code || !config) return go(errorPage, config ? "failed" : "unavailable");

  // Link and convert must finish in the same Mullwell account that started them.
  const current = await currentUserId();
  if (flow.intent !== "signin" && current !== flow.userId) return go("/login", "expired");

  let claims;
  try {
    const idToken = await exchangeCode(config, { code, verifier: flow.verifier, redirectUri: redirectUriFor(env().APP_URL) });
    claims = await verifyIdToken(config, idToken, flow.nonce, remoteKeys(config.issuer));
  } catch (err) {
    console.error("[xanom] sign-in failed:", err instanceof Error ? err.message : "unknown error");
    return go(errorPage, "failed");
  }

  const result = await linkXanom(await getDb(), { intent: flow.intent, currentUserId: current, claims, now: Date.now() });
  if (!result.ok) return go(errorPage, result.error);
  await startSession(result.userId);
  const done = new URL(flow.returnTo, env().APP_URL);
  if (flow.intent !== "signin") done.searchParams.set("xanom", "linked");
  return NextResponse.redirect(done, { status: 303, headers: noStore });
}
