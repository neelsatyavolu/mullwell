import { fail, handle, ok, readBody } from "@/lib/api";
import { register } from "@/lib/account/accounts";
import { MIN_PASSWORD_LENGTH, registerSchema } from "@/lib/account/input";
import { getDb } from "@/lib/db/client";
import { ipKey, startSession } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";

export const dynamic = "force-dynamic";

// POST /api/account/register: create an account and sign this browser in.
export function POST(req: Request) {
  return handle(req, async () => {
    if (!(await allow("register", ipKey(req)))) return fail("Too many new accounts from here. Try again later.", 429);
    const body = await readBody(req, registerSchema);
    if (!body) return fail(`Enter a valid email and a password of at least ${MIN_PASSWORD_LENGTH} characters.`, 400);
    const userId = await register(await getDb(), { ...body, now: Date.now() });
    if (!userId) return fail("An account with that email already exists. Sign in instead.", 409);
    await startSession(userId);
    return ok({ email: body.email });
  });
}
