import { fail, ok, readBody, withUser } from "@/lib/api";
import { deleteSchema } from "@/lib/account/input";
import { verifyPassword } from "@/lib/account/password";
import { clearAllSessions } from "@/lib/ai/session";
import { getDb } from "@/lib/db/client";
import { deleteUser, endSessions, getUser } from "@/lib/db/users";
import { endSession, startSession } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

// GET /api/account: who is signed in.
export function GET(req: Request) {
  return withUser(req, async (userId) => {
    const user = await getUser(await getDb(), userId);
    return user ? ok({ id: user.id, email: user.email, createdAt: user.createdAt }) : fail("Sign in first.", 401);
  });
}

// POST /api/account: { action: "signout-everywhere" } ends every other session.
export function POST(req: Request) {
  return withUser(req, async (userId) => {
    const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
    if (body?.action !== "signout-everywhere") return fail("Unknown action.", 400);
    await endSessions(await getDb(), userId);
    await startSession(userId);
    return ok({});
  });
}

// DELETE /api/account: delete the account and everything in it, after checking the password.
export function DELETE(req: Request) {
  return withUser(req, async (userId) => {
    const body = await readBody(req, deleteSchema);
    if (!body) return fail("Enter your password to delete your account.", 400);
    const db = await getDb();
    const user = await getUser(db, userId);
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) return fail("That password isn't right.", 401);
    await deleteUser(db, userId);
    await clearAllSessions();
    await endSession();
    return ok({});
  });
}
