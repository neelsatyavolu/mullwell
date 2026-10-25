"use client";
import { useEffect, useId, useRef, useState } from "react";

// Renders Mermaid code to SVG in Mullwell's colors (read from the CSS tokens,
// so light and dark both match). securityLevel "strict" sanitizes the output.

function themeVariables() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    background: v("--surface"),
    primaryColor: v("--accent-soft"),
    primaryBorderColor: v("--accent"),
    primaryTextColor: v("--ink"),
    secondaryColor: v("--surface-2"),
    tertiaryColor: v("--surface-2"),
    lineColor: v("--ink-3"),
    textColor: v("--ink"),
    edgeLabelBackground: v("--surface"),
    fontFamily: getComputedStyle(document.body).fontFamily,
    fontSize: "15px",
  };
}

export function useMermaid(code: string | null): { svg: string | null; failed: boolean } {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const renders = useRef(0);
  const [state, setState] = useState<{ svg: string | null; failed: boolean }>({ svg: null, failed: false });

  useEffect(() => {
    if (!code) return;
    let live = true;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables: themeVariables(), flowchart: { curve: "basis", padding: 14 } });
        // A fresh id per render: Mermaid throws if an earlier render with the same id is still in flight.
        const out = await mermaid.render(`mm${id}${++renders.current}`, code);
        if (live) setState({ svg: out.svg, failed: false });
      } catch {
        if (live) setState({ svg: null, failed: true });
      }
    })();
    return () => {
      live = false;
    };
  }, [code, id]);

  return state;
}
