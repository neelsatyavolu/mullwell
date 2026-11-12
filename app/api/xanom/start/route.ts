import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getUser } from "@/lib/db/users";
import { currentUserId, signingKey } from "@/lib/server/auth";
import { env } from "@/lib/server/env";
import { xanomConfig } from "@/lib/server/xanom";
import { authorizeUrl, FLOW_COOKIE, FLOW_TTL_MS, isIntent, newFlow, redirectUriFor, safeReturn, sealFlow } from "@/lib/xanom/flow";
import { convertTicket } from "@/lib/xanom/tokens";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function back(path: string, error: string) {
  const url = new URL(path, env().APP_URL);
  url.searchParams.set("xanom_error", error);
  return NextResponse.redirect(url, { status: 303, headers: noStore });
}

// GET /api/xanom/start?intent=signin|link|convert&return=<path>
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const intent = params.get("intent") ?? "signin";
  if (!isIntent(intent)) return NextResponse.json({ ok: false, error: "Unknown intent." }, { status: 400, headers: noStore });
  // Mullwell has no iOS app, so only the web flow exists.
  if ((params.get("platform") ?? "web") !== "web") return NextResponse.json({ ok: false, error: "Unsupported platform." }, { status: 400, headers: noStore });
  const fallback = intent === "signin" ? "/" : "/settings";
  const returnTo = safeReturn(params.get("return"), fallback);
  const errorPage = intent === "signin" ? "/login" : "/settings";

  const config = xanomConfig();
  if (!config) return back(errorPage, "unavailable");

  const userId = intent === "signin" ? null : await currentUserId();
  if (intent !== "signin" && !userId) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/settings")}`, env().APP_URL), { status: 303, headers: noStore });

  const now = Date.now();
  const flow = newFlow({ intent, returnTo, userId, now });
  let extra: { convert?: string; loginHint?: string } = {};
  if (intent === "convert" && userId) {
    const user = await getUser(await getDb(), userId);
    if (!user) return back("/login", "failed");
    if (user.xanomSub) return back("/settings", "already_linked");
    const ticket = await convertTicket(config, { email: user.email, name: user.email.split("@")[0], emailVerified: user.emailVerified, now });
    extra = { convert: ticket, loginHint: user.email };
  }

  (await cookies()).set(FLOW_COOKIE, sealFlow(signingKey(), flow), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/xanom",
    maxAge: FLOW_TTL_MS / 1000,
  });
  return NextResponse.redirect(authorizeUrl(config, flow, redirectUriFor(env().APP_URL), extra), { status: 303, headers: noStore });
}
