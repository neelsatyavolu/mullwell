import type { Queryable } from "./client";

// A student's library on the server, synced with each browser's IndexedDB.
// Every write carries the client's updatedAt; a write older than what is
// stored is ignored (last write wins). Each accepted write takes a new seq,
// so a browser asks for "everything after seq N" to catch up.

export const RECORD_KINDS = ["courses", "sets", "exams", "runs", "cards", "attempts"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export type Change = { kind: RecordKind; id: string; data: unknown | null; updatedAt: number };
export type StoredChange = Change & { seq: number };

/** Applies changes (data null deletes). Returns how many were newer than what was stored. */
export async function applyChanges(q: Queryable, userId: string, changes: Change[]): Promise<number> {
  let applied = 0;
  for (const c of changes) {
    const rows = await q.query(
      `INSERT INTO records (user_id, kind, id, data, deleted, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       ON CONFLICT (user_id, kind, id) DO UPDATE
         SET data = EXCLUDED.data, deleted = EXCLUDED.deleted, updated_at = EXCLUDED.updated_at, seq = nextval('record_seq')
         WHERE records.updated_at <= EXCLUDED.updated_at
       RETURNING seq`,
      [userId, c.kind, c.id, c.data === null ? null : JSON.stringify(c.data), c.data === null, c.updatedAt],
    );
    applied += rows.length;
  }
  return applied;
}

/** Changes after `since`, oldest first, at most `limit`. */
export async function changesSince(q: Queryable, userId: string, since: number, limit: number): Promise<StoredChange[]> {
  const rows = await q.query<{ kind: RecordKind; id: string; data: unknown; deleted: boolean; updated_at: string | number; seq: string | number }>(
    "SELECT kind, id, data, deleted, updated_at, seq FROM records WHERE user_id = $1 AND seq > $2 ORDER BY seq LIMIT $3",
    [userId, since, limit],
  );
  return rows.map((r) => ({ kind: r.kind, id: r.id, data: r.deleted ? null : r.data, updatedAt: Number(r.updated_at), seq: Number(r.seq) }));
}
