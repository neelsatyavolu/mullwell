import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { aiModels } from "@/lib/ai/models";
import { hasSession } from "@/lib/ai/session";

export const dynamic = "force-dynamic";

// GET /api/ai/status: which providers this browser has connected, and their models.
export function GET(req: Request) {
  return withUser(req, async (owner) => {
    const [codex, grok, models] = await Promise.all([hasSession("codex", owner), hasSession("grok", owner), aiModels()]);
    return NextResponse.json({ ok: true, connected: { codex, grok }, models });
  });
}
