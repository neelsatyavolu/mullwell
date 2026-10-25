"use client";
import { useRouter } from "next/navigation";
import { ReviewDeck } from "@/components/ReviewDeck";
import { dueItems } from "@/lib/client/derived";
import { useLibrary } from "@/lib/client/store";

export default function ReviewPage() {
  const router = useRouter();
  const { library, ready } = useLibrary();
  const due = ready ? dueItems(library) : [];
  return (
    <main className="page page-narrow stack">
      <div className="stack" style={{ gap: 4 }}>
        <h1 className="title">Review</h1>
        <p className="muted">Cards from all your classes that are due, mixed together. Mixing subjects is harder, and that&apos;s why it works.</p>
      </div>
      {ready && (
        <ReviewDeck
          items={due}
          onCite={(setId, n) => router.push(`/set/${setId}?tab=source#passage-${n}`)}
          emptyText="Nothing is due. Cards come back here when it's time to review them."
        />
      )}
    </main>
  );
}
