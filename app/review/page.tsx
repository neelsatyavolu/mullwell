"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Practice } from "@/components/Practice";
import { ReviewDeck } from "@/components/ReviewDeck";
import { usePrefs } from "@/lib/client/ai";
import { dueItems, todayItems } from "@/lib/client/derived";
import { useLibrary } from "@/lib/client/store";
import type { TodayQueue } from "@/lib/study/today";

// Today's session: new questions first (they need a real first answer), then
// the due reviews as flashcards. The session is fixed when it starts, so
// answering doesn't shift it; Keep going builds the next one.

type Session = { queue: TodayQueue; step: "new" | "review"; n: number };

export default function ReviewPage() {
  const router = useRouter();
  const { library, ready } = useLibrary();
  const prefs = usePrefs();
  const build = (n: number): Session => {
    const queue = todayItems(library, prefs);
    return { queue, step: queue.fresh.length ? "new" : "review", n };
  };
  const [session, setSession] = useState<Session | null>(null);
  if (ready && !session) setSession(build(0));

  const cite = (setId: string, n: number) => router.push(`/set/${setId}?tab=source&passage=${n}#passage-${n}`);
  // Due cards the session's cap left out (or that came due since it started).
  const remaining = ready ? dueItems(library).length : 0;
  const finish = remaining > 0
    ? { label: "Keep going", note: `${remaining} more due.`, run: () => session && setSession(build(session.n + 1)) }
    : { label: "Back to Today", note: undefined, run: () => router.push("/") };

  return (
    <main className="page page-narrow stack">
      <div className="stack" style={{ gap: 4 }}>
        <h1 className="title">Review</h1>
        <p className="muted">Today&apos;s reviews and new questions from all your classes, mixed together. Mixing subjects is harder, and that&apos;s why it works.</p>
      </div>
      {session && (session.step === "new" ? (
        <div className="stack" key={session.n}>
          <p className="label num">New questions ({session.queue.fresh.length})</p>
          <Practice
            items={session.queue.fresh}
            size={session.queue.fresh.length}
            onCite={cite}
            doneLabel={session.queue.due.length ? "Start reviews" : finish.label}
            onDone={session.queue.due.length ? () => setSession({ ...session, step: "review" }) : finish.run}
          />
        </div>
      ) : (
        <div className="stack" key={session.n}>
          {session.queue.due.length > 0 && <p className="label num">Reviews ({session.queue.due.length})</p>}
          <ReviewDeck
            items={session.queue.due}
            onCite={cite}
            emptyText="Nothing is due. Cards come back here when it's time to review them."
            next={remaining > 0 ? { label: finish.label, note: finish.note, onClick: finish.run } : { label: finish.label, href: "/" }}
          />
        </div>
      ))}
    </main>
  );
}
