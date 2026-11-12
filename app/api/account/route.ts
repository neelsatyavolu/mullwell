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
    if (!user) return fail("Sign in first.", 401);
    return ok({
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      hasPassword: user.passwordHash !== null,
      xanom: user.xanomSub ? { email: user.xanomEmail ?? user.email } : null,
    });
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

// DELETE /api/account: delete the account and everything in it, after checking the
// password (or, for an account with none, its email typed back).
export function DELETE(req: Request) {
  return withUser(req, async (userId) => {
    const body = await readBody(req, deleteSchema);
    if (!body) return fail("Confirm to delete your account.", 400);
    const db = await getDb();
    const user = await getUser(db, userId);
    if (!user) return fail("Sign in first.", 401);
    const confirmed = user.passwordHash
      ? await verifyPassword(body.password, user.passwordHash)
      : body.password.trim().toLowerCase() === user.email;
    if (!confirmed) return fail(user.passwordHash ? "That password isn't right." : "Type your email exactly to confirm.", 401);
    await deleteUser(db, userId);
    await clearAllSessions();
    await endSession();
    return ok({});
  });
}
