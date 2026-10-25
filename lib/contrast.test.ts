import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// DESIGN.md: text on the app's surfaces meets WCAG AA (4.5:1). This reads the
// color tokens and text rules straight from globals.css, in both themes.

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2].toLowerCase()]));
}

const light = tokens(css.slice(0, css.indexOf("@media (prefers-color-scheme: dark)")));
const dark = { ...light, ...tokens(css.slice(css.indexOf("@media (prefers-color-scheme: dark)"), css.indexOf("* { box-sizing"))) };

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

/** A var(--token) or color-mix(in srgb, var(--a) P%, var(--b)) value, as sRGB. */
function resolve(value: string, theme: Record<string, string>): Rgb {
  const v = /^var\(--([\w-]+)\)$/.exec(value.trim());
  if (v) return rgb(theme[v[1]]);
  const mix = /^color-mix\(in srgb, var\(--([\w-]+)\) (\d+)%, var\(--([\w-]+)\)\)$/.exec(value.trim());
  if (!mix) throw new Error(`Can't resolve ${value}`);
  const p = Number(mix[2]) / 100;
  const a = rgb(theme[mix[1]]);
  const b = rgb(theme[mix[3]]);
  return a.map((c, i) => c * p + b[i] * (1 - p)) as Rgb;
}

function luminance([r, g, b]: Rgb) {
  const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a: Rgb, b: Rgb) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The text color a top-level rule sets, e.g. ".label". */
function colorOf(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = new RegExp(`^${escaped}(?:,[^{]*)? \\{([^}]*)\\}`, "m").exec(css);
  const color = rule && /(?:^|[;\s])color:\s*([^;]+);/.exec(rule[1]);
  if (!color) throw new Error(`No color for ${selector}`);
  return color[1];
}

const THEMES = { light, dark };
const SMALL_TEXT = [".label", ".quote-label", ".step-eyebrow", ".beat-label", ".meta", ".stat-label"];

describe("text contrast (WCAG AA)", () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    describe(name, () => {
      it.each(SMALL_TEXT)("%s on page, card and inset", (selector) => {
        const fg = resolve(colorOf(selector), theme);
        for (const bg of ["bg", "surface", "surface-2"]) expect(ratio(fg, rgb(theme[bg]))).toBeGreaterThanOrEqual(4.5);
      });

      it.each([".chip-accent", ".cite"])("%s on accent-soft", (selector) => {
        expect(ratio(resolve(colorOf(selector), theme), rgb(theme["accent-soft"]))).toBeGreaterThanOrEqual(4.5);
      });

      it.each([".verdict-right", ".verdict-partly", ".verdict-wrong"])("%s text on its tint", (selector) => {
        const tint = { ".verdict-right": "good-soft", ".verdict-partly": "warn-soft", ".verdict-wrong": "bad-soft" }[selector]!;
        expect(ratio(resolve(colorOf(".verdict"), theme), rgb(theme[tint]))).toBeGreaterThanOrEqual(4.5);
        expect(css).not.toMatch(new RegExp(`^\\${selector} \\{[^}]*(?:^|[;\\s])color:`, "m"));
      });
    });
  }
});
