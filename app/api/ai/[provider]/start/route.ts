import { NextResponse } from "next/server";
import { fail, withUser } from "@/lib/api";
import { buildAuthorizeUrl, generatePkce, isProvider } from "@/lib/ai/providers";
import { writePkce } from "@/lib/ai/session";

export const dynamic = "force-dynamic";

// POST /api/ai/:provider/start: begin sign-in. The browser opens authorizeUrl,
// then pastes back the callback link (ChatGPT) or code (Grok).
export function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  return withUser(req, async () => {
    const { provider } = await params;
    if (!isProvider(provider)) return fail("Unknown provider.", 404);
    const { verifier, challenge, state } = generatePkce();
    await writePkce(provider, { verifier, state });
    return NextResponse.json({ ok: true, authorizeUrl: buildAuthorizeUrl(provider, challenge, state) });
  });
}
