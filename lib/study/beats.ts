// Splits a lesson explanation into beats: small cards shown one at a time.
// The teach task writes "### <Label>" headings with "---" between beats.
// Older explanations (plain paragraphs) are split into pairs of paragraphs.

export type BeatKind = "idea" | "how" | "example" | "picture" | "diagram" | "watch" | "recap" | "wrong" | "text";

export type Beat = { kind: BeatKind; label: string; body: string; mermaid: string | null };

const KINDS: Record<string, BeatKind> = {
  "big idea": "idea",
  "how it works": "how",
  example: "example",
  "picture it": "picture",
  diagram: "diagram",
  "watch out": "watch",
  recap: "recap",
  "what went wrong": "wrong",
};

function toBeat(chunk: string): Beat | null {
  const text = chunk.trim();
  if (!text) return null;
  const heading = /^#{2,4}\s*(.+?)\s*$/m.exec(text.split("\n")[0] ?? "");
  const label = heading ? heading[1].replace(/[*_:]/g, "").trim() : "";
  const body = (heading ? text.split("\n").slice(1).join("\n") : text).trim();
  const kind = KINDS[label.toLowerCase()] ?? (label ? "text" : "text");
  const mermaid = /```mermaid\s*\n([\s\S]*?)```/.exec(body)?.[1]?.trim() ?? null;
  if (kind === "diagram" && !mermaid) return body ? { kind: "text", label, body, mermaid: null } : null;
  if (!body) return null;
  return { kind, label: label || "", body: kind === "diagram" ? "" : body, mermaid: kind === "diagram" ? mermaid : null };
}

/**
 * The beats in `text`. While the text is still streaming, the last chunk may
 * be unfinished; `complete` false leaves it out so a card never changes
 * under the student.
 */
export function parseBeats(text: string, complete: boolean): Beat[] {
  const clean = text.replace(/\r\n?/g, "\n");
  const structured = /^#{2,4}\s/m.test(clean) || /^-{3,}\s*$/m.test(clean);
  const chunks = structured ? clean.split(/^\s*-{3,}\s*$/m) : paragraphPairs(clean);
  const usable = complete ? chunks : chunks.slice(0, -1);
  return usable.map(toBeat).filter((b): b is Beat => b !== null);
}

function paragraphPairs(text: string): string[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < paras.length; i += 2) out.push(paras.slice(i, i + 2).join("\n\n"));
  return out;
}
