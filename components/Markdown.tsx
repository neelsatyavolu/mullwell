"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// Notes and tutor replies. Citations like [§3] or [§3, §5] become chips that
// jump to that passage of the source.

export function linkCitations(text: string): string {
  return text.replace(/\[((?:§\s?\d+\s*,?\s*)+)\]/g, (_, inner: string) =>
    (inner.match(/\d+/g) ?? []).map((n) => `[§${n}](#cite-${n})`).join(" "),
  );
}

export function Markdown({ text, onCite, compact }: { text: string; onCite?: (section: number) => void; compact?: boolean }) {
  return (
    <div className={compact ? "md md-compact" : "md"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a({ href, children }) {
            const cite = /^#cite-(\d+)$/.exec(href ?? "");
            if (cite) {
              const n = Number(cite[1]);
              // Without a handler the chip is only a label, not a dead button.
              if (!onCite) return <span className="cite">§{n}</span>;
              return (
                <button type="button" className="cite" onClick={() => onCite(n)} aria-label={`Source section ${n}`}>
                  §{n}
                </button>
              );
            }
            const safe = href && /^https?:\/\//i.test(href) ? href : undefined;
            return <a href={safe} target="_blank" rel="noreferrer noopener">{children}</a>;
          },
          img: () => null,
        }}
      >
        {linkCitations(text)}
      </ReactMarkdown>
    </div>
  );
}
