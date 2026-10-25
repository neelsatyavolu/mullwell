import { fail, ok, readBody, withUser } from "@/lib/api";
import { pushSchema } from "@/lib/account/sync-input";
import { getDb } from "@/lib/db/client";
import { applyChanges, changesSince } from "@/lib/db/records";
import { allow } from "@/lib/server/limits";

export const dynamic = "force-dynamic";

const PAGE = 500;

// GET /api/sync?since=<seq>: the account's changes after seq, a page at a time.
export function GET(req: Request) {
  return withUser(req, async (userId) => {
    const since = Number(new URL(req.url).searchParams.get("since") ?? 0);
    if (!Number.isSafeInteger(since) || since < 0) return fail("Bad cursor.", 400);
    const changes = await changesSince(await getDb(), userId, since, PAGE);
    return ok({ changes, more: changes.length === PAGE, cursor: changes.at(-1)?.seq ?? since });
  });
}

// POST /api/sync: { changes } from this browser; data null deletes. Older writes lose.
export function POST(req: Request) {
  return withUser(req, async (userId) => {
    if (!(await allow("sync", userId))) return fail("Syncing too fast. It will catch up shortly.", 429);
    const body = await readBody(req, pushSchema);
    if (!body) return fail("Invalid sync request.", 400);
    const applied = await applyChanges(await getDb(), userId, body.changes);
    return ok({ applied });
  });
}
