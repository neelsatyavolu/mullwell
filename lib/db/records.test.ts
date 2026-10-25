import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "./client";
import { migrate } from "./schema";
import { applyChanges, changesSince } from "./records";
import { insertUser } from "./users";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
let db: Db;

beforeEach(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await insertUser(db, { id: alice, email: "a@x.test", passwordHash: "h", createdAt: 1 });
  await insertUser(db, { id: bob, email: "b@x.test", passwordHash: "h", createdAt: 1 });
});

describe("records", () => {
  it("stores changes and returns them after a cursor, per user", async () => {
    await applyChanges(db, alice, [{ kind: "sets", id: "s1", data: { title: "A" }, updatedAt: 10 }]);
    await applyChanges(db, bob, [{ kind: "sets", id: "s1", data: { title: "B" }, updatedAt: 10 }]);
    const all = await changesSince(db, alice, 0, 100);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ kind: "sets", id: "s1", data: { title: "A" }, updatedAt: 10 });
    expect(await changesSince(db, alice, all[0].seq, 100)).toEqual([]);
  });

  it("keeps the newest write and ignores older ones", async () => {
    await applyChanges(db, alice, [{ kind: "sets", id: "s1", data: { v: 2 }, updatedAt: 20 }]);
    expect(await applyChanges(db, alice, [{ kind: "sets", id: "s1", data: { v: 1 }, updatedAt: 10 }])).toBe(0);
    expect(await applyChanges(db, alice, [{ kind: "sets", id: "s1", data: { v: 3 }, updatedAt: 30 }])).toBe(1);
    expect((await changesSince(db, alice, 0, 100))[0].data).toEqual({ v: 3 });
  });

  it("records deletes as tombstones that sync like changes", async () => {
    await applyChanges(db, alice, [{ kind: "cards", id: "q1", data: { due: 1 }, updatedAt: 10 }]);
    const [first] = await changesSince(db, alice, 0, 100);
    await applyChanges(db, alice, [{ kind: "cards", id: "q1", data: null, updatedAt: 11 }]);
    const after = await changesSince(db, alice, first.seq, 100);
    expect(after).toEqual([expect.objectContaining({ kind: "cards", id: "q1", data: null })]);
  });

  it("pages in order", async () => {
    await applyChanges(db, alice, Array.from({ length: 5 }, (_, i) => ({ kind: "attempts" as const, id: `a${i}`, data: { i }, updatedAt: i })));
    const page = await changesSince(db, alice, 0, 2);
    expect(page.map((c) => c.id)).toEqual(["a0", "a1"]);
    expect((await changesSince(db, alice, page[1].seq, 10)).map((c) => c.id)).toEqual(["a2", "a3", "a4"]);
  });
});
