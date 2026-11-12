import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { env } from "@/lib/server/env";
import { xanomConfig } from "@/lib/server/xanom";
import { buildSummary } from "@/lib/xanom/summary";
import { remoteKeys, verifySummaryToken } from "@/lib/xanom/tokens";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

// GET /api/xanom/summary: the dashboard card, for a request signed by accounts.xanom.co.
export async function GET(req: Request) {
  const config = xanomConfig();
  if (!config) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });
  let sub: string;
  try {
    sub = await verifySummaryToken(config, req.headers.get("authorization"), remoteKeys(config.issuer));
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { ...noStore, "WWW-Authenticate": "Bearer" } });
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    return NextResponse.json(await buildSummary(await getDb(), sub, env().APP_URL, today), { headers: noStore });
  } catch (err) {
    console.error("[xanom] summary failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "failed" }, { status: 500, headers: noStore });
  }
}
