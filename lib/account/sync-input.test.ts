import { expect, it } from "vitest";
import { pushSchema } from "./sync-input";

it("accepts valid changes and rejects bad kinds, ids and oversized records", () => {
  expect(pushSchema.safeParse({ changes: [{ kind: "sets", id: "s_abc", data: { a: 1 }, updatedAt: 1 }] }).success).toBe(true);
  expect(pushSchema.safeParse({ changes: [{ kind: "users", id: "x", data: {}, updatedAt: 1 }] }).success).toBe(false);
  expect(pushSchema.safeParse({ changes: [{ kind: "sets", id: "../x", data: {}, updatedAt: 1 }] }).success).toBe(false);
  expect(pushSchema.safeParse({ changes: [{ kind: "sets", id: "s", data: { t: "x".repeat(1_600_000) }, updatedAt: 1 }] }).success).toBe(false);
  expect(pushSchema.safeParse({ changes: [] }).success).toBe(false);
});
