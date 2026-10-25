"use client";
import { Icon, type IconName } from "../Icon";
import { Markdown } from "../Markdown";
import { useMermaid } from "../useMermaid";
import type { Beat, BeatKind } from "@/lib/study/beats";

// One beat of a lesson step, styled by what kind of beat it is.

const LOOK: Record<BeatKind, { icon: IconName; label: string; tone: "accent" | "warn" }> = {
  idea: { icon: "idea", label: "Big idea", tone: "accent" },
  how: { icon: "how", label: "How it works", tone: "accent" },
  example: { icon: "example", label: "Example", tone: "accent" },
  picture: { icon: "picture", label: "Picture it", tone: "accent" },
  diagram: { icon: "diagram", label: "Diagram", tone: "accent" },
  watch: { icon: "watch", label: "Watch out", tone: "warn" },
  recap: { icon: "recap", label: "Recap", tone: "accent" },
  wrong: { icon: "wrong", label: "What went wrong", tone: "warn" },
  text: { icon: "text", label: "", tone: "accent" },
};

function Diagram({ code }: { code: string }) {
  const { svg, failed } = useMermaid(code);
  if (failed) return <p className="muted small">This diagram couldn&apos;t be drawn.</p>;
  if (!svg) return <div className="skeleton" style={{ height: 140 }} />;
  return <div className="mermaid-wrap beat-figure" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function BeatCard({ beat, onCite }: { beat: Beat; onCite: (section: number) => void }) {
  const look = LOOK[beat.kind];
  const label = beat.label || look.label || "Lesson";
  return (
    <div className={`beat beat-${beat.kind} beat-tone-${look.tone}`}>
      <div className="beat-head">
        <span className="beat-icon"><Icon name={look.icon} /></span>
        <span className="beat-label">{label}</span>
      </div>
      {beat.kind === "diagram" && beat.mermaid ? (
        <Diagram code={beat.mermaid} />
      ) : (
        <div className="beat-body"><Markdown text={beat.body} onCite={onCite} /></div>
      )}
    </div>
  );
}
