// Pure pieces of library sync: the outbox of local changes waiting to be
// sent, how they're batched, and whether a change from the server should
// replace what this browser has.

export type SyncChange = { kind: string; id: string; data: unknown | null; updatedAt: number };

export const changeKey = (c: { kind: string; id: string }) => `${c.kind}\u0000${c.id}`;

/** The outbox with `change` added; a newer change to the same record replaces the older one. */
export function enqueue(outbox: Map<string, SyncChange>, change: SyncChange): Map<string, SyncChange> {
  const key = changeKey(change);
  const existing = outbox.get(key);
  if (existing && existing.updatedAt > change.updatedAt) return outbox;
  return new Map(outbox).set(key, change);
}

/** Splits changes into requests of at most `maxCount` changes and about `maxBytes` of JSON. */
export function toBatches(changes: SyncChange[], maxCount: number, maxBytes: number): SyncChange[][] {
  const batches: SyncChange[][] = [];
  let current: SyncChange[] = [];
  let bytes = 0;
  for (const c of changes) {
    const size = JSON.stringify(c).length;
    if (current.length && (current.length >= maxCount || bytes + size > maxBytes)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(c);
    bytes += size;
  }
  if (current.length) batches.push(current);
  return batches;
}

/** A server change wins unless this browser has a newer unsent change to the same record. */
export function remoteWins(remote: SyncChange, outbox: Map<string, SyncChange>): boolean {
  const pending = outbox.get(changeKey(remote));
  return !pending || pending.updatedAt <= remote.updatedAt;
}

/** Removes changes the server has accepted, unless they were superseded while the request was in flight. */
export function acknowledge(outbox: Map<string, SyncChange>, sent: SyncChange[]): Map<string, SyncChange> {
  const next = new Map(outbox);
  for (const c of sent) if (next.get(changeKey(c)) === c) next.delete(changeKey(c));
  return next;
}
