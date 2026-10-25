import { fail, handle, ok, readBody } from "@/lib/api";
import { signIn } from "@/lib/account/accounts";
import { loginSchema } from "@/lib/account/input";
import { getDb } from "@/lib/db/client";
import { ipKey, startSession } from "@/lib/server/auth";
import { allow } from "@/lib/server/limits";

export const dynamic = "force-dynamic";

// POST /api/account/login
export function POST(req: Request) {
  return handle(req, async () => {
    if (!(await allow("login", ipKey(req)))) return fail("Too many attempts. Try again in 15 minutes.", 429);
    const body = await readBody(req, loginSchema);
    if (!body) return fail("Enter your email and password.", 400);
    const userId = await signIn(await getDb(), body);
    if (!userId) return fail("That email and password don't match an account.", 401);
    await startSession(userId);
    return ok({ email: body.email });
  });
}
