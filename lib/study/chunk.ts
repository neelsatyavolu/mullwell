import type { Section } from "./types";

// Splits pasted or extracted material into numbered sections that questions
// and notes can cite. Headings start a new section; long stretches are cut at
// paragraph breaks so each section stays small enough to quote from.

const MAX_CHARS = 2400;
const MIN_CHARS = 280;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

type Block = { title: string | null; text: string };

function blocksByHeading(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block = { title: null, text: "" };
  for (const line of text.split("\n")) {
    const heading = HEADING.exec(line);
    if (heading) {
      if (current.text.trim() || current.title) blocks.push(current);
      current = { title: heading[2].trim(), text: "" };
    } else {
      current = { ...current, text: `${current.text}${line}\n` };
    }
  }
  if (current.text.trim() || current.title) blocks.push(current);
  return blocks.map((b) => ({ ...b, text: b.text.trim() }));
}

/** Splits text into pieces of at most `max` chars at paragraph, then sentence, then word breaks. */
export function splitLong(text: string, max = MAX_CHARS): string[] {
  if (text.length <= max) return [text];
  const units = text.split(/\n\s*\n/).flatMap((p) => (p.length <= max ? [p] : p.split(/(?<=[.!?])\s+/)));
  const pieces: string[] = [];
  let current = "";
  for (const unit of units.flatMap((u) => (u.length <= max ? [u] : u.match(new RegExp(`.{1,${max}}(\\s|$)`, "gs")) ?? [u]))) {
    const joined = current ? `${current}\n\n${unit}` : unit;
    if (joined.length > max && current) {
      pieces.push(current);
      current = unit;
    } else {
      current = joined;
    }
  }
  if (current) pieces.push(current);
  return pieces.map((p) => p.trim()).filter(Boolean);
}

function fallbackTitle(text: string): string {
  const words = text.replace(/[#*_>`]/g, "").trim().split(/\s+/).slice(0, 7).join(" ");
  return words.length < text.trim().length ? `${words}…` : words;
}

export function toSections(text: string): Section[] {
  const clean = text.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim();
  if (!clean) return [];
  const pieces = blocksByHeading(clean).flatMap((b) => {
    const parts = b.text ? splitLong(b.text) : [];
    return parts.map((p, i) => ({ title: b.title ? (parts.length > 1 ? `${b.title} (${i + 1})` : b.title) : null, text: p }));
  });
  // Merge tiny untitled fragments into the piece before them.
  const merged = pieces.reduce<{ title: string | null; text: string }[]>((acc, p) => {
    const last = acc[acc.length - 1];
    if (last && !p.title && (p.text.length < MIN_CHARS || last.text.length < MIN_CHARS) && last.text.length + p.text.length <= MAX_CHARS) {
      return [...acc.slice(0, -1), { ...last, text: `${last.text}\n\n${p.text}` }];
    }
    return [...acc, p];
  }, []);
  return merged.map((p, i) => ({ id: i + 1, title: p.title ?? fallbackTitle(p.text), text: p.text }));
}

/** Groups consecutive sections into batches of about `budget` chars, for one question request each. */
export function batches(sections: Section[], budget = 7000): Section[][] {
  return sections.reduce<Section[][]>((acc, s) => {
    const last = acc[acc.length - 1];
    const size = last?.reduce((n, x) => n + x.text.length, 0) ?? 0;
    if (last && size + s.text.length <= budget) return [...acc.slice(0, -1), [...last, s]];
    return [...acc, [s]];
  }, []);
}

/** A title for pasted material: its first heading, else its first words. */
export function guessTitle(text: string): string {
  for (const line of text.split("\n")) {
    const heading = HEADING.exec(line);
    if (heading) return heading[2].trim().slice(0, 80);
  }
  const first = text.trim().split("\n")[0] ?? "";
  return (fallbackTitle(first) || "Untitled set").slice(0, 80);
}
