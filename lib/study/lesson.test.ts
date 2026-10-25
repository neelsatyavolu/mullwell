import { describe, expect, it } from "vitest";
import { advance, afterCheckpoint, buildSteps, familiarityFrom, needsReteach, pickSetTitle, progress } from "./lesson";
import type { Lesson } from "./types";

const sections = [
  { id: 1, title: "Glycolysis", text: "Glycolysis happens in the cytoplasm and splits glucose into two pyruvate molecules." },
  { id: 2, title: "Krebs", text: "The Krebs cycle runs in the mitochondrial matrix and releases carbon dioxide." },
  { id: 3, title: "ETC", text: "The electron transport chain builds a proton gradient that ATP synthase uses to make ATP." },
];
let n = 0;
const newId = (p: string) => `${p}${++n}`;
const probe = { kind: "mcq", prompt: "Where does glycolysis happen?", choices: ["Nucleus", "Cytoplasm", "Matrix", "Membrane"], correct: 1, quote: "Glycolysis happens in the cytoplasm and splits glucose", section: 1 };

describe("buildSteps", () => {
  it("keeps valid steps with grounded probes and covers every section", () => {
    const { steps, probes } = buildSteps(
      [
        { title: "Glycolysis", goal: "Explain glycolysis", sections: [1], probe },
        { title: "Bogus", sections: [99] },
        "garbage",
        { title: "Mitochondria", sections: ["2"], probe: { ...probe, quote: "made up words not in the notes at all" } },
      ],
      sections,
      newId,
    );
    expect(steps.map((s) => s.title)).toEqual(["Glycolysis", "Mitochondria"]);
    expect(steps[1].sections).toEqual([2, 3]);
    expect(probes).toHaveLength(1);
    expect(steps[0].probeId).toBe(probes[0].id);
    expect(steps[1].probeId).toBeNull();
    expect(steps[0]).toMatchObject({ status: "todo", tries: 0, explanations: [], familiarity: null });
  });

  it("returns nothing for an unusable outline", () => {
    expect(buildSteps([{ title: "x", sections: [] }], sections, newId).steps).toEqual([]);
  });
});

it("pickSetTitle takes the outline's clean title and ignores step lines", () => {
  expect(pickSetTitle([{ setTitle: '  "Price Elasticity of Demand."  ' }, { title: "Step" }])).toBe("Price Elasticity of Demand");
  expect(pickSetTitle([{ title: "Step", sections: [1] }])).toBeNull();
  expect(pickSetTitle([{ setTitle: "x".repeat(200) }, { setTitle: "Supply and Demand" }])).toBe("Supply and Demand");
});

it("familiarityFrom treats guesses and partial answers as shaky", () => {
  expect(familiarityFrom("unknown", "sure")).toBe("new");
  expect(familiarityFrom("wrong", "sure")).toBe("new");
  expect(familiarityFrom("partly", "sure")).toBe("shaky");
  expect(familiarityFrom("right", "guess")).toBe("shaky");
  expect(familiarityFrom("right", "sure")).toBe("known");
});

describe("checkpoints", () => {
  const step = buildSteps([{ title: "G", sections: [1, 2, 3] }], sections, newId).steps[0];
  it("finishes on a right answer and re-teaches once before marking for review", () => {
    expect(afterCheckpoint(step, "right").status).toBe("done");
    const missed = afterCheckpoint({ ...step, explanations: ["first"] }, "wrong");
    expect(missed).toMatchObject({ status: "todo", tries: 1 });
    expect(needsReteach(missed)).toBe(true);
    expect(needsReteach({ ...missed, explanations: ["first", "again"] })).toBe(false);
    expect(afterCheckpoint(missed, "partly")).toMatchObject({ status: "review", tries: 2 });
  });
});

describe("advance", () => {
  const steps = buildSteps([{ title: "A", sections: [1] }, { title: "B", sections: [2] }, { title: "C", sections: [3] }], sections, newId).steps;
  const lesson: Lesson = { phase: "learn", steps, current: 0, createdAt: 0 };
  it("moves to the next unfinished step, wraps to skipped ones, then finishes", () => {
    const a = advance({ ...lesson, steps: [{ ...steps[0], status: "done" }, steps[1], steps[2]] });
    expect(a.current).toBe(1);
    const wrapped = advance({ ...lesson, current: 2, steps: [steps[0], { ...steps[1], status: "done" }, { ...steps[2], status: "review" }] });
    expect(wrapped.current).toBe(0);
    const done = advance({ ...lesson, steps: steps.map((s) => ({ ...s, status: "done" as const })) });
    expect(done.phase).toBe("done");
    expect(progress({ ...lesson, steps: [{ ...steps[0], status: "done" }, { ...steps[1], status: "review" }, steps[2]] })).toEqual({ done: 1, review: 1, total: 3 });
  });
});
