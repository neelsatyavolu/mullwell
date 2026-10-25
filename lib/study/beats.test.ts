import { describe, expect, it } from "vitest";
import { parseBeats } from "./beats";

const text = `### Big idea
**Glycolysis** splits glucose in the cytoplasm. [§1]
---
### Diagram
\`\`\`mermaid
flowchart LR
  A["Glucose"] --> B["2 Pyruvate"]
\`\`\`
---
### Watch out
It is not in the mitochondria. [§1]`;

describe("parseBeats", () => {
  it("reads labelled beats, including diagrams", () => {
    const beats = parseBeats(text, true);
    expect(beats.map((b) => b.kind)).toEqual(["idea", "diagram", "watch"]);
    expect(beats[0]).toMatchObject({ label: "Big idea", body: "**Glycolysis** splits glucose in the cytoplasm. [§1]" });
    expect(beats[1].mermaid).toContain('A["Glucose"] --> B["2 Pyruvate"]');
  });

  it("holds back the unfinished last beat while streaming", () => {
    expect(parseBeats(text, false).map((b) => b.kind)).toEqual(["idea", "diagram"]);
    expect(parseBeats("### Big idea\nhalf a sent", false)).toEqual([]);
  });

  it("turns a diagram without Mermaid into text, and unknown labels into plain beats", () => {
    expect(parseBeats("### Diagram\njust words", true)[0]).toMatchObject({ kind: "text", body: "just words" });
    expect(parseBeats("### Fun fact\nsomething", true)[0]).toMatchObject({ kind: "text", label: "Fun fact" });
  });

  it("splits older plain explanations into pairs of paragraphs", () => {
    const beats = parseBeats("One.\n\nTwo.\n\nThree.", true);
    expect(beats.map((b) => b.body)).toEqual(["One.\n\nTwo.", "Three."]);
    expect(beats[0].kind).toBe("text");
  });
});
