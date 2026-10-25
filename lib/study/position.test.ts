import { describe, expect, it } from "vitest";
import { gaugeSaveIndex, restoreGaugeIndex, restoreScreen } from "./position";

const three = "### Big idea\nOne.\n\n---\n\n### Example\nTwo.\n\n---\n\n### Recap\nThree.";
const step = (explanations: string[], extra: { status?: "todo" | "done" | "review"; tries?: number } = {}) => ({ id: "st1", explanations, status: "todo" as const, tries: 0, ...extra });

describe("restoreScreen", () => {
  it("restores a saved beat in the same step", () => {
    expect(restoreScreen({ stepId: "st1", screen: { kind: "beats", round: 0, index: 2 } }, step([three]))).toEqual({ kind: "beats", round: 0, index: 2 });
  });

  it("restores the intro and the checkpoint", () => {
    expect(restoreScreen({ stepId: "st1", screen: { kind: "check" } }, step([three]))).toEqual({ kind: "check" });
    expect(restoreScreen({ stepId: "st1", screen: { kind: "intro" } }, step([]))).toEqual({ kind: "intro" });
  });

  it("opens a finished step at its intro, not on a checkpoint it already answered", () => {
    expect(restoreScreen({ stepId: "st1", screen: { kind: "check" } }, step([three], { status: "done", tries: 1 }))).toBeNull();
    expect(restoreScreen({ stepId: "st1", screen: { kind: "check" } }, step([three, three], { status: "review", tries: 2 }))).toBeNull();
  });

  it("sends a just-missed checkpoint to its re-explanation instead of the next question", () => {
    expect(restoreScreen({ stepId: "st1", screen: { kind: "check" } }, step([three], { tries: 1 }))).toEqual({ kind: "beats", round: 1, index: 0 });
    expect(restoreScreen({ stepId: "st1", screen: { kind: "check" } }, step([three, three], { tries: 1 }))).toEqual({ kind: "check" });
  });

  it("ignores a position saved for another step", () => {
    expect(restoreScreen({ stepId: "other", screen: { kind: "check" } }, step([three]))).toBeNull();
  });

  it("keeps the beat inside the explanation", () => {
    expect(restoreScreen({ stepId: "st1", screen: { kind: "beats", round: 0, index: 9 } }, step([three]))).toEqual({ kind: "beats", round: 0, index: 2 });
  });

  it("allows the round still being written, from its start", () => {
    expect(restoreScreen({ stepId: "st1", screen: { kind: "beats", round: 1, index: 3 } }, step([three]))).toEqual({ kind: "beats", round: 1, index: 0 });
    expect(restoreScreen({ stepId: "st1", screen: { kind: "beats", round: 0, index: 2 } }, step([]))).toEqual({ kind: "beats", round: 0, index: 0 });
  });

  it("rejects rounds that don't exist and anything malformed", () => {
    expect(restoreScreen({ stepId: "st1", screen: { kind: "beats", round: 3, index: 0 } }, step([three]))).toBeNull();
    expect(restoreScreen({ stepId: "st1", screen: { kind: "beats", round: -1, index: 0 } }, step([three]))).toBeNull();
    expect(restoreScreen({ stepId: "st1", screen: { kind: "beats", round: 0.5, index: 0 } }, step([three]))).toBeNull();
    expect(restoreScreen({ stepId: "st1", screen: { kind: "later" } }, step([three]))).toBeNull();
    expect(restoreScreen(null, step([three]))).toBeNull();
    expect(restoreScreen("st1", step([three]))).toBeNull();
  });
});

describe("restoreGaugeIndex", () => {
  it("restores an index inside the gauge", () => {
    expect(restoreGaugeIndex({ index: 2 }, 4)).toBe(2);
  });

  it("rejects an index outside it or malformed", () => {
    expect(restoreGaugeIndex({ index: 4 }, 4)).toBeNull();
    expect(restoreGaugeIndex({ index: -1 }, 4)).toBeNull();
    expect(restoreGaugeIndex({ index: "1" }, 4)).toBeNull();
    expect(restoreGaugeIndex(null, 4)).toBeNull();
  });
});

describe("gaugeSaveIndex", () => {
  it("keeps an unanswered question, and moves past an answered one so a refresh doesn't ask it again", () => {
    expect(gaugeSaveIndex(1, false, 4)).toBe(1);
    expect(gaugeSaveIndex(1, true, 4)).toBe(2);
  });

  it("stays on the last question, since the gauge ends there", () => {
    expect(gaugeSaveIndex(3, true, 4)).toBe(3);
  });
});
