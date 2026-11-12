import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "../db/client";
import { applyChanges } from "../db/records";
import { migrate } from "../db/schema";
import { linkXanom } from "./link";
import { buildSummary } from "./summary";

let db: Db;

beforeEach(async () => {
  db = await createPgliteDb();
  await migrate(db);
});

describe("xanom summary", () => {
  it("is unlinked for an unknown sub", async () => {
    expect(await buildSummary(db, "xa_nobody", "https://mullwell.xanom.co", "2026-11-12")).toEqual({ linked: false });
  });

  it("counts classes, sets, upcoming tests and answers, and lists the three newest sets", async () => {
    const { userId } = (await linkXanom(db, { intent: "signin", currentUserId: null, claims: { sub: "xa_1", email: "a@b.co", name: null }, now: 1 })) as { userId: string };
    await applyChanges(db, userId, [
      { kind: "courses", id: "c1", data: { id: "c1", name: "Bio" }, updatedAt: 1 },
      { kind: "sets", id: "s1", data: { title: "Cells" }, updatedAt: 10 },
      { kind: "sets", id: "s2", data: { title: "Genetics" }, updatedAt: 30 },
      { kind: "sets", id: "s3", data: { title: "Evolution" }, updatedAt: 20 },
      { kind: "sets", id: "s4", data: { title: "Ecology" }, updatedAt: 40 },
      { kind: "sets", id: "s5", data: null, updatedAt: 50 },
      { kind: "exams", id: "e1", data: { date: "2026-11-20" }, updatedAt: 1 },
      { kind: "exams", id: "e2", data: { date: "2026-10-01" }, updatedAt: 1 },
      { kind: "attempts", id: "a1", data: {}, updatedAt: 1 },
    ]);
    const s = await buildSummary(db, "xa_1", "https://mullwell.xanom.co", "2026-11-12");
    expect(s).toEqual({
      linked: true,
      headline: "1 class · 4 study sets",
      items: [
        { label: "Classes", value: "1" },
        { label: "Study sets", value: "4" },
        { label: "Upcoming tests", value: "1" },
        { label: "Questions answered", value: "1" },
      ],
      recent: [
        { title: "Ecology", url: "https://mullwell.xanom.co/set/s4", at: new Date(40).toISOString() },
        { title: "Genetics", url: "https://mullwell.xanom.co/set/s2", at: new Date(30).toISOString() },
        { title: "Evolution", url: "https://mullwell.xanom.co/set/s3", at: new Date(20).toISOString() },
      ],
      url: "https://mullwell.xanom.co/",
    });
  });
});
