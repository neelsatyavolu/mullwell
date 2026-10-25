import { z } from "zod";
import { RECORD_KINDS } from "../db/records";

// What a browser may send to /api/sync. Records are the student's own data,
// so they're stored as given, but bounded in count and size.

export const MAX_CHANGES = 200;
export const MAX_RECORD_BYTES = 1_500_000;

const change = z.object({
  kind: z.enum(RECORD_KINDS),
  id: z.string().regex(/^[A-Za-z0-9_:-]{1,120}$/),
  data: z.record(z.string(), z.unknown()).nullable(),
  updatedAt: z.number().int().min(0).max(8.64e15),
});

export const pushSchema = z.object({
  changes: z
    .array(change)
    .min(1)
    .max(MAX_CHANGES)
    .refine((list) => list.every((c) => c.data === null || JSON.stringify(c.data).length <= MAX_RECORD_BYTES), "A record is too large to sync."),
});
