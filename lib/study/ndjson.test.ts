import { describe, expect, it } from "vitest";
import { createObjectParser, firstObject } from "./ndjson";

function parseAll(chunks: string[]) {
  const got: unknown[] = [];
  const p = createObjectParser((v) => got.push(v));
  for (const c of chunks) p.push(c);
  p.flush();
  return got;
}

describe("createObjectParser", () => {
  it("emits each object as soon as it closes, across chunk boundaries", () => {
    const got: unknown[] = [];
    const p = createObjectParser((v) => got.push(v));
    p.push('```json\n{"a":1}\n{"b"');
    expect(got).toEqual([{ a: 1 }]);
    p.push(':2},\n{"c":3}');
    expect(got).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });

  it("handles pretty-printed objects, arrays and nested values", () => {
    expect(parseAll(['[\n  {\n    "a": 1,\n    "n": {"x": [1, 2]}\n  },\n', '  {"a": 2}\n]'])).toEqual([{ a: 1, n: { x: [1, 2] } }, { a: 2 }]);
  });

  it("ignores braces inside strings", () => {
    expect(parseAll(['{"q":"Solve {x} \\"now\\" }","k":1}'])).toEqual([{ q: 'Solve {x} "now" }', k: 1 }]);
  });

  it("skips invalid objects and prose", () => {
    expect(parseAll(["hello {broken: 1} then ", '{"ok":true}'])).toEqual([{ ok: true }]);
  });
});

describe("firstObject", () => {
  it("pulls an object out of surrounding text", () => {
    expect(firstObject('sure: {"verdict":"right"} ok')).toEqual({ verdict: "right" });
    expect(firstObject("nothing")).toBeNull();
    expect(firstObject("{bad}")).toBeNull();
  });
});
