import { randomUUID } from "node:crypto";
import type { Db } from "../db/client";
import { attachXanom, findUserByEmail, findUserByXanomSub, getUser, insertUser, revokePassword } from "../db/users";
import type { Intent } from "./flow";
import type { XanomClaims } from "./tokens";

// SPEC §2 linking rules, applied in order after the id_token checks out.

export type LinkError = "sub_taken" | "already_linked" | "email_mismatch" | "create_failed";
export type LinkResult = { ok: true; userId: string; rule: 1 | 2 | 3 | 4 } | { ok: false; error: LinkError };

export async function linkXanom(db: Db, input: { intent: Intent; currentUserId: string | null; claims: XanomClaims; now: number }): Promise<LinkResult> {
  const { intent, currentUserId, claims } = input;
  return db.transaction(async (tx): Promise<LinkResult> => {
    const owner = await findUserByXanomSub(tx, claims.sub);
    const current = currentUserId ? await getUser(tx, currentUserId) : null;

    // Rule 2 comes first for link/convert so a signed-in user is never silently switched
    // to another account that already holds this Xanom login.
    if ((intent === "link" || intent === "convert") && current) {
      if (owner && owner.id !== current.id) return { ok: false, error: "sub_taken" };
      if (owner) return { ok: true, userId: current.id, rule: 1 };
      if (current.xanomSub) return { ok: false, error: "already_linked" };
      if (intent === "convert" && claims.email !== current.email) return { ok: false, error: "email_mismatch" };
      await attachXanom(tx, current.id, claims.sub, claims.email);
      return { ok: true, userId: current.id, rule: 2 };
    }

    // Rule 1: this Xanom account is already linked.
    if (owner) return { ok: true, userId: owner.id, rule: 1 };

    // Rule 3: an account with the same email. If Mullwell never verified that address and it has a
    // password, whoever set that password may not own the email: drop it and end its sessions.
    const sameEmail = await findUserByEmail(tx, claims.email);
    if (sameEmail) {
      if (!sameEmail.emailVerified && sameEmail.passwordHash !== null) await revokePassword(tx, sameEmail.id);
      await attachXanom(tx, sameEmail.id, claims.sub, claims.email);
      return { ok: true, userId: sameEmail.id, rule: 3 };
    }

    // Rule 4: a new account with no password.
    const id = randomUUID();
    const created = await insertUser(tx, { id, email: claims.email, passwordHash: null, createdAt: input.now, emailVerified: true, xanomSub: claims.sub, xanomEmail: claims.email });
    return created ? { ok: true, userId: id, rule: 4 } : { ok: false, error: "create_failed" };
  });
}
