"use client";
import Link from "next/link";
import { useLibrary } from "@/lib/client/store";
import { groupMissesBySet } from "@/lib/study/run";
import type { RunResult } from "@/lib/study/types";

// After a practice test: what was missed, set by set, each linking back to
// that set's practice.

const CONCEPTS_SHOWN = 4;

/** `nested` drops the inset behind each row, for use inside an inset. */
export function MissedBySet({ results, nested = false }: { results: RunResult[]; nested?: boolean }) {
  const { library } = useLibrary();
  const groups = groupMissesBySet(results, library.sets);
  if (!groups.length) return null;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="small muted">What to go over</p>
      {groups.map((g) => (
        <p key={g.setId} className={nested ? "small num" : "inset small num"}>
          <Link href={`/set/${g.setId}?tab=practice`} style={{ fontWeight: 600 }}>{g.title}</Link>
          <span className="muted"> · {g.count} missed{g.concepts.length ? `: ${g.concepts.slice(0, CONCEPTS_SHOWN).join(", ")}` : ""}</span>
        </p>
      ))}
    </div>
  );
}
