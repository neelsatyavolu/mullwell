import { describe, expect, it } from "vitest";
import { answeredCount, draftItems, formatElapsed, groupMissesBySet, parseDraft, type TestDraft } from "./run";
import type { ExamItem } from "./exam";
import type { Item, RunResult, StudySet } from "./types";

const item = (id: string, concept = id): Item => ({ id, kind: "short", prompt: `Prompt for ${id}`, answer: "a", quote: "", section: 1, explain: "", concept, status: "ok" });
const set = (id: string, title: string, items: Item[]): Pick<StudySet, "id" | "title" | "items"> => ({ id, title, items });
const result = (itemId: string, setId: string, verdict: RunResult["verdict"]): RunResult => ({ itemId, setId, verdict });
const examItem = (id: string, setId = "s1"): ExamItem => ({ ...item(id), setId });

describe("groupMissesBySet", () => {
  const sets = {
    s1: set("s1", "Cells", [item("a", "mitosis"), item("b", "meiosis"), item("c", "mitosis")]),
    s2: set("s2", "Energy", [item("d", "ATP"), item("e", "")]),
  };

  it("groups misses by set, most missed first, with each concept once", () => {
    const groups = groupMissesBySet(
      [result("d", "s2", "wrong"), result("a", "s1", "wrong"), result("b", "s1", "partly"), result("c", "s1", "wrong"), result("e", "s2", "right")],
      sets,
    );
    expect(groups).toEqual([
      { setId: "s1", title: "Cells", count: 3, concepts: ["mitosis", "meiosis"] },
      { setId: "s2", title: "Energy", count: 1, concepts: ["ATP"] },
    ]);
  });

  it("falls back to the start of the prompt when a question has no concept", () => {
    expect(groupMissesBySet([result("e", "s2", "wrong")], sets)[0].concepts).toEqual(["Prompt for e"]);
  });

  it("keeps a deleted question's miss in the count but skips sets that are gone", () => {
    const groups = groupMissesBySet([result("gone", "s1", "wrong"), result("x", "s9", "wrong")], sets);
    expect(groups).toEqual([{ setId: "s1", title: "Cells", count: 1, concepts: [] }]);
  });

  it("returns nothing when everything was right", () => {
    expect(groupMissesBySet([result("a", "s1", "right")], sets)).toEqual([]);
  });
});

describe("parseDraft", () => {
  const good: TestDraft = { itemIds: ["a", "b"], answers: { a: "1" }, confidences: { a: "sure" }, started: 1000 };

  it("reads a saved draft", () => {
    expect(parseDraft(JSON.parse(JSON.stringify(good)))).toEqual(good);
  });

  it("rejects anything that isn't a draft", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft("x")).toBeNull();
    expect(parseDraft({ ...good, itemIds: [] })).toBeNull();
    expect(parseDraft({ ...good, itemIds: [1] })).toBeNull();
    expect(parseDraft({ ...good, started: "soon" })).toBeNull();
  });

  it("drops answers and confidences that don't fit", () => {
    const d = parseDraft({ ...good, answers: { a: "1", b: 2, z: "x" }, confidences: { a: "very", b: "guess", z: "sure" } });
    expect(d?.answers).toEqual({ a: "1" });
    expect(d?.confidences).toEqual({ b: "guess" });
  });
});

describe("draftItems", () => {
  const items = [examItem("a"), examItem("b"), examItem("c")];

  it("returns the draft's questions in its order", () => {
    expect(draftItems({ itemIds: ["c", "a"], answers: {}, confidences: {}, started: 0 }, items)?.map((i) => i.id)).toEqual(["c", "a"]);
  });

  it("returns null when a question no longer exists", () => {
    expect(draftItems({ itemIds: ["a", "gone"], answers: {}, confidences: {}, started: 0 }, items)).toBeNull();
  });
});

describe("answeredCount", () => {
  it("counts questions with a non-blank answer", () => {
    expect(answeredCount(["a", "b", "c"], { a: "1", b: "  ", z: "x" })).toBe(1);
  });
});

describe("formatElapsed", () => {
  it("shows minutes and seconds", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(65_400)).toBe("01:05");
    expect(formatElapsed(75 * 60_000 + 3_000)).toBe("75:03");
  });

  it("never shows negative time", () => {
    expect(formatElapsed(-5_000)).toBe("00:00");
  });
});
