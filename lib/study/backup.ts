import { z } from "zod";

// Export and restore of the whole local library, so browser data loss doesn't
// wipe a semester of review history.

export const BACKUP_VERSION = 1;

const record = z.record(z.string(), z.record(z.string(), z.unknown()));
const backup = z.object({
  app: z.literal("mullwell"),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.number(),
  data: z.object({ courses: record, sets: record, exams: record, runs: record, cards: record, attempts: record }),
});

export type Backup = z.infer<typeof backup>;

export function makeBackup(data: Backup["data"], now = Date.now()): Backup {
  return { app: "mullwell", version: BACKUP_VERSION, exportedAt: now, data };
}

/** Parses a backup file, or explains why it can't be used. */
export function readBackup(text: string): { ok: true; backup: Backup } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't a Mullwell backup." };
  }
  const parsed = backup.safeParse(json);
  return parsed.success ? { ok: true, backup: parsed.data } : { ok: false, error: "That file isn't a Mullwell backup, or it's from a newer version." };
}
