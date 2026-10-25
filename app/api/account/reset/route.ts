import { fail, handle, ok, readBody } from "@/lib/api";
import { resetPassword } from "@/lib/account/accounts";
import { MIN_PASSWORD_LENGTH, RESET_LINK_DEAD, resetSchema } from "@/lib/account/input";
import { getDb } from "@/lib/db/client";
import { ipKey, startSession } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";

export const dynamic = "force-dynamic";

// POST /api/account/reset: set a new password with the emailed token. Ends
// every other session and signs this browser in.
export function POST(req: Request) {
  return handle(req, async () => {
    if (!(await allow("reset", ipKey(req)))) return fail("Too many attempts. Try again in 15 minutes.", 429);
    const body = await readBody(req, resetSchema);
    if (!body) return fail(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`, 400);
    const userId = await resetPassword(await getDb(), { ...body, now: Date.now() });
    if (!userId) return fail(RESET_LINK_DEAD, 400);
    await startSession(userId);
    return ok({});
  });
}
