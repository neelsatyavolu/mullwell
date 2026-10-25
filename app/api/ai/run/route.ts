import { z } from "zod";
import { fail, withUser } from "@/lib/api";
import { resolveModel } from "@/lib/ai/models";
import { isTask, planTask } from "@/lib/ai/tasks";
import { getActiveSession } from "@/lib/ai/session";
import { streamModel } from "@/lib/ai/stream";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const body = z.object({
  provider: z.enum(["codex", "grok"]),
  model: z.string().max(100).optional(),
  task: z.string().max(40),
  input: z.unknown(),
});

// POST /api/ai/run: run one study task on the student's own subscription and
// stream the result back as NDJSON (see lib/ai/stream.ts).
export function POST(req: Request) {
  return withUser(req, async (userId) => {
    const parsed = body.parse(await req.json().catch(() => ({})));
    if (!isTask(parsed.task)) return fail("Unknown task.", 404);
    const plan = planTask(parsed.task, parsed.input);
    const tokens = await getActiveSession(parsed.provider, userId);
    if (!tokens) return fail("Connect ChatGPT or Grok in Settings first.", 401);
    const model = await resolveModel(parsed.provider, parsed.model, plan.speed);
    const stream = streamModel({ provider: parsed.provider, tokens, model, ...plan });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
    });
  });
}
