import type { Queryable } from "./client";

// Idempotent statements, run in order on every start. Later changes go at
// the end as ALTERs so existing databases catch up.
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    session_version integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL
  )`,
  // Reset links sent and not yet used. Only a hash of each token is kept.
  `CREATE TABLE IF NOT EXISTS password_resets (
    token_hash text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key text PRIMARY KEY,
    window_start timestamptz NOT NULL,
    count integer NOT NULL
  )`,
  // A student's library: one row per class, set, test, card, attempt or test run.
  // updated_at is the client's clock, used for last-write-wins; seq orders changes for sync.
  `CREATE SEQUENCE IF NOT EXISTS record_seq`,
  `CREATE TABLE IF NOT EXISTS records (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind text NOT NULL,
    id text NOT NULL,
    data jsonb,
    deleted boolean NOT NULL DEFAULT false,
    updated_at bigint NOT NULL,
    seq bigint NOT NULL DEFAULT nextval('record_seq'),
    PRIMARY KEY (user_id, kind, id)
  )`,
  `CREATE INDEX IF NOT EXISTS records_user_seq ON records (user_id, seq)`,
];

export async function migrate(db: Queryable): Promise<void> {
  for (const statement of STATEMENTS) await db.query(statement);
}
