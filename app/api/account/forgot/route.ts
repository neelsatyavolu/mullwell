import { fail, handle, ok, readBody } from "@/lib/api";
import { issueReset } from "@/lib/account/accounts";
import { forgotSchema, RESET_REQUESTED } from "@/lib/account/input";
import { resetLink, sendResetLink } from "@/lib/account/reset-mail";
import { getDb } from "@/lib/db/client";
import { findUserByEmail } from "@/lib/db/users";
import { ipKey } from "@/lib/server/auth";
import { env } from "@/lib/server/env";
import { allow } from "@/lib/server/limits";

export const dynamic = "force-dynamic";

// One answer whether or not the address has an account, or a limit held the
// email back, so this form can't be used to find out who uses Mullwell.
const requested = () => ok({ message: RESET_REQUESTED });

// POST /api/account/forgot: email a password reset link.
export function POST(req: Request) {
  return handle(req, async () => {
    if (!(await allow("forgot", ipKey(req)))) return fail("Too many attempts. Try again in 15 minutes.", 429);
    const body = await readBody(req, forgotSchema);
    if (!body) return fail("Enter a valid email.", 400);
    if (!(await allow("forgotEmail", body.email))) return requested();
    const db = await getDb();
    const user = await findUserByEmail(db, body.email);
    if (!user) return requested();
    if (!(await allow("forgotSentDaily", "all"))) {
      console.error("[mullwell] the day's reset emails are used up, so one was not sent");
      return requested();
    }
    const token = await issueReset(db, user.id, Date.now());
    try {
      await sendResetLink(user.email, resetLink(env().APP_URL, token), env().RESEND_API_KEY);
    } catch (err) {
      // Only the error's own words: never the link, the address or the key.
      console.error("[mullwell] reset email not sent:", err instanceof Error ? err.message : "unknown error");
      return fail("The reset email couldn't be sent. Try again later.", 502);
    }
    return requested();
  });
}
