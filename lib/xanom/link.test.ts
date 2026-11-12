import { beforeEach, describe, expect, it } from "vitest";
import { accountIn, issueReset, register, resetPassword, signIn } from "../account/accounts";
import { createSession, sessionKey } from "../account/session";
import { createPgliteDb, type Db } from "../db/client";
import { migrate } from "../db/schema";
import { getUser } from "../db/users";
import { linkXanom } from "./link";

const key = sessionKey("a-long-enough-test-secret");
const claims = (over: Partial<{ sub: string; email: string; name: string | null }> = {}) => ({ sub: "xa_1", email: "ada@example.com", name: "Ada", ...over });
let db: Db;

beforeEach(async () => {
  db = await createPgliteDb();
  await migrate(db);
});

describe("xanom linking rules", () => {
  it("rule 4 then rule 1: creates a passwordless account once, then signs in as it", async () => {
    const first = await linkXanom(db, { intent: "signin", currentUserId: null, claims: claims(), now: 1 });
    expect(first).toMatchObject({ ok: true, rule: 4 });
    const user = await getUser(db, (first as { userId: string }).userId);
    expect(user).toMatchObject({ email: "ada@example.com", passwordHash: null, xanomSub: "xa_1", emailVerified: true });
    expect(await signIn(db, { email: "ada@example.com", password: "anything" })).toBeNull();
    const again = await linkXanom(db, { intent: "signin", currentUserId: null, claims: claims({ email: "changed@example.com" }), now: 2 });
    expect(again).toEqual({ ok: true, userId: user!.id, rule: 1 });
  });

  it("rule 2: link attaches to the signed-in user even under a different email", async () => {
    const id = (await register(db, { email: "ada@example.com", password: "correct horse", now: 1 }))!;
    const res = await linkXanom(db, { intent: "link", currentUserId: id, claims: claims({ email: "ada@work.example" }), now: 2 });
    expect(res).toEqual({ ok: true, userId: id, rule: 2 });
    expect(await getUser(db, id)).toMatchObject({ xanomSub: "xa_1", xanomEmail: "ada@work.example", emailVerified: false });
    // The password still works: linking is not the pre-hijacking case.
    expect(await signIn(db, { email: "ada@example.com", password: "correct horse" })).toBe(id);
  });

  it("rule 2: convert needs the same email, and marks it verified", async () => {
    const id = (await register(db, { email: "ada@example.com", password: "correct horse", now: 1 }))!;
    expect(await linkXanom(db, { intent: "convert", currentUserId: id, claims: claims({ email: "other@example.com" }), now: 2 })).toEqual({ ok: false, error: "email_mismatch" });
    expect(await linkXanom(db, { intent: "convert", currentUserId: id, claims: claims(), now: 2 })).toEqual({ ok: true, userId: id, rule: 2 });
    expect(await getUser(db, id)).toMatchObject({ xanomSub: "xa_1", emailVerified: true });
    expect(await signIn(db, { email: "ada@example.com", password: "correct horse" })).toBe(id);
  });

  it("rule 2: refuses a Xanom account already on another user, or a user already linked", async () => {
    const other = (await linkXanom(db, { intent: "signin", currentUserId: null, claims: claims({ email: "bea@example.com" }), now: 1 })) as { userId: string };
    const id = (await register(db, { email: "ada@example.com", password: "correct horse", now: 1 }))!;
    expect(await linkXanom(db, { intent: "link", currentUserId: id, claims: claims({ email: "bea@example.com" }), now: 2 })).toEqual({ ok: false, error: "sub_taken" });
    expect((await getUser(db, other.userId))!.xanomSub).toBe("xa_1");
    await linkXanom(db, { intent: "link", currentUserId: id, claims: claims({ sub: "xa_2" }), now: 3 });
    expect(await linkXanom(db, { intent: "link", currentUserId: id, claims: claims({ sub: "xa_3" }), now: 4 })).toEqual({ ok: false, error: "already_linked" });
  });

  it("rule 3 guard: an unverified account with a password loses the password and every session", async () => {
    const id = (await register(db, { email: "ada@example.com", password: "attacker pass", now: 1 }))!;
    const old = createSession(key, id, 1000, 0);
    expect(await accountIn(db, key, old, 2000)).toBe(id);
    const res = await linkXanom(db, { intent: "signin", currentUserId: null, claims: claims(), now: 2 });
    expect(res).toEqual({ ok: true, userId: id, rule: 3 });
    expect(await getUser(db, id)).toMatchObject({ passwordHash: null, xanomSub: "xa_1", emailVerified: true });
    expect(await signIn(db, { email: "ada@example.com", password: "attacker pass" })).toBeNull();
    expect(await accountIn(db, key, old, 2000)).toBeNull();
  });

  it("rule 3: an account verified by a completed reset keeps its password and sessions", async () => {
    const id = (await register(db, { email: "ada@example.com", password: "correct horse", now: 1 }))!;
    await resetPassword(db, { token: await issueReset(db, id, 1000), password: "new password!", now: 1001 });
    const version = (await getUser(db, id))!.emailVerified;
    expect(version).toBe(true);
    const session = createSession(key, id, 1000, 1);
    expect(await linkXanom(db, { intent: "signin", currentUserId: null, claims: claims(), now: 2 })).toEqual({ ok: true, userId: id, rule: 3 });
    expect(await signIn(db, { email: "ada@example.com", password: "new password!" })).toBe(id);
    expect(await accountIn(db, key, session, 2000)).toBe(id);
  });

  it("link or convert with nobody signed in falls through to the email rules", async () => {
    const res = await linkXanom(db, { intent: "convert", currentUserId: null, claims: claims(), now: 1 });
    expect(res).toMatchObject({ ok: true, rule: 4 });
  });
});

it("rule 3 guard also kills a password sign-in that was mid-check when the password was revoked", async () => {
  const { passwordSignIn } = await import("../account/accounts");
  const id = (await register(db, { email: "ada@example.com", password: "attacker pass", now: 1 }))!;
  const pending = passwordSignIn(db, { email: "ada@example.com", password: "attacker pass" });
  await linkXanom(db, { intent: "signin", currentUserId: null, claims: claims(), now: 2 });
  const signedIn = await pending;
  // Whichever way the race lands, a session made from this sign-in no longer counts.
  if (signedIn) expect(await accountIn(db, key, createSession(key, id, 1000, signedIn.version), 2000)).toBeNull();
});
