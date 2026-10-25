import { expect, it } from "vitest";
import { makeBackup, readBackup } from "./backup";

const data = { courses: { c1: { id: "c1", name: "Bio" } }, sets: {}, exams: {}, runs: {}, cards: {}, attempts: {} };

it("round-trips a backup", () => {
  const r = readBackup(JSON.stringify(makeBackup(data, 5)));
  expect(r).toEqual({ ok: true, backup: { app: "mullwell", version: 1, exportedAt: 5, data } });
});

it("rejects other files", () => {
  expect(readBackup("not json")).toMatchObject({ ok: false });
  expect(readBackup(JSON.stringify({ app: "other" }))).toMatchObject({ ok: false });
});
