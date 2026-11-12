import type { Queryable, Row } from "./client";
import { toTs } from "./time";

export type User = {
  id: string;
  email: string;
  /** Null for an account made through Xanom, or one whose password was revoked. */
  passwordHash: string | null;
  createdAt: number;
  emailVerified: boolean;
  xanomSub: string | null;
  xanomEmail: string | null;
  sessionVersion: number;
};

export type NewUser = Pick<User, "id" | "email" | "passwordHash" | "createdAt"> & Partial<Pick<User, "emailVerified" | "xanomSub" | "xanomEmail">>;

const rowToUser = (row: Row): User => ({
  id: row.id as string,
  email: row.email as string,
  passwordHash: (row.password_hash as string | null) ?? null,
  createdAt: new Date(row.created_at as string).getTime(),
  emailVerified: row.email_verified === true,
  xanomSub: (row.xanom_sub as string | null) ?? null,
  xanomEmail: (row.xanom_email as string | null) ?? null,
  sessionVersion: Number(row.session_version ?? 0),
});

/** False when the email (or Xanom account) already belongs to an account. */
export async function insertUser(q: Queryable, user: NewUser): Promise<boolean> {
  const rows = await q.query(
    `INSERT INTO users (id, email, password_hash, created_at, email_verified, xanom_sub, xanom_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING RETURNING id`,
    [user.id, user.email, user.passwordHash, toTs(user.createdAt), user.emailVerified ?? false, user.xanomSub ?? null, user.xanomEmail ?? null],
  );
  return rows.length === 1;
}

export async function findUserByXanomSub(q: Queryable, sub: string): Promise<User | null> {
  const [row] = await q.query("SELECT * FROM users WHERE xanom_sub = $1", [sub]);
  return row ? rowToUser(row) : null;
}

/** Ties the account to a Xanom account. Xanom only signs in verified addresses, so the email counts as verified when it matches. */
export async function attachXanom(q: Queryable, id: string, sub: string, xanomEmail: string): Promise<void> {
  await q.query(
    "UPDATE users SET xanom_sub = $2, xanom_email = $3, email_verified = email_verified OR email = $3 WHERE id = $1",
    [id, sub, xanomEmail],
  );
}

/** Drops the password and ends every session (the account pre-hijacking guard). */
export async function revokePassword(q: Queryable, id: string): Promise<void> {
  await q.query("UPDATE users SET password_hash = NULL, session_version = session_version + 1 WHERE id = $1", [id]);
}

export async function findUserByEmail(q: Queryable, email: string): Promise<User | null> {
  const [row] = await q.query("SELECT * FROM users WHERE email = $1", [email]);
  return row ? rowToUser(row) : null;
}

export async function getUser(q: Queryable, id: string): Promise<User | null> {
  const [row] = await q.query("SELECT * FROM users WHERE id = $1", [id]);
  return row ? rowToUser(row) : null;
}

/** The version a session must carry to still count, or null when there is no such account. */
export async function sessionVersionOf(q: Queryable, id: string): Promise<number | null> {
  const [row] = await q.query<{ session_version: number }>("SELECT session_version FROM users WHERE id = $1", [id]);
  return row?.session_version ?? null;
}

/** Stores a new password and ends every session made under the old one. Only a reset calls this, and the reset link came by email, so the address is now verified. */
export async function replacePassword(q: Queryable, id: string, passwordHash: string): Promise<void> {
  await q.query("UPDATE users SET password_hash = $2, email_verified = true, session_version = session_version + 1 WHERE id = $1", [id, passwordHash]);
}

/** Ends every session the account has, everywhere. */
export async function endSessions(q: Queryable, id: string): Promise<void> {
  await q.query("UPDATE users SET session_version = session_version + 1 WHERE id = $1", [id]);
}

/** Deletes the account; its resets and library go with it (ON DELETE CASCADE). */
export async function deleteUser(q: Queryable, id: string): Promise<void> {
  await q.query("DELETE FROM users WHERE id = $1", [id]);
}
