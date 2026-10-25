import { describe, expect, it } from "vitest";
import { calibration, calibrationLine, confidentMisses } from "./calibration";
import type { Attempt, AttemptMode, Confidence, Item, Verdict } from "./types";

const attempt = (itemId: string, verdict: Verdict, confidence: Confidence, at: number, extra: Partial<Attempt> = {}): Attempt => ({
  itemId, setId: "s1", at, verdict, confidence, ...extra,
});
const item = (id: string): Item => ({ id, kind: "short", prompt: id, answer: "a", quote: "", section: 1, explain: "", concept: id, status: "ok" });

describe("calibration", () => {
  it("counts answers and right answers for each level of confidence", () => {
    const c = calibration([
      attempt("a", "right", "sure", 1),
      attempt("b", "wrong", "sure", 2),
      attempt("c", "partly", "unsure", 3),
      attempt("d", "right", "guess", 4),
    ]);
    expect(c).toEqual({ sure: { n: 2, right: 1 }, unsure: { n: 1, right: 0 }, guess: { n: 1, right: 1 } });
  });

  it("counts attempts with no mode, but not self-ratings, pretests or explain-backs", () => {
    const modes: (AttemptMode | undefined)[] = [undefined, "practice", "lesson", "review", "gauge", "explain", "test"];
    const c = calibration(modes.map((mode, k) => attempt(`i${k}`, "right", "sure", k, mode ? { mode } : {})));
    expect(c.sure).toEqual({ n: 4, right: 4 });
  });

  it("counts a practice test answer only when the student picked Sure or Guessing", () => {
    const c = calibration([
      attempt("a", "wrong", "sure", 1, { mode: "test" }),
      attempt("b", "right", "guess", 2, { mode: "test" }),
      attempt("c", "right", "unsure", 3, { mode: "test" }),
    ]);
    expect(c).toEqual({ sure: { n: 1, right: 0 }, unsure: { n: 0, right: 0 }, guess: { n: 1, right: 1 } });
  });

  it("leaves out \"I don't know\", which isn't a guess", () => {
    const c = calibration([
      attempt("a", "wrong", "guess", 1, { mode: "practice", source: "self" }),
      attempt("b", "wrong", "guess", 2, { mode: "practice", source: "self", response: "my answer" }),
    ]);
    expect(c.guess).toEqual({ n: 1, right: 0 });
  });

  it("skips a record with an unknown confidence instead of failing", () => {
    const odd = { ...attempt("a", "right", "sure", 1), confidence: "very" as Confidence };
    expect(calibration([odd, attempt("b", "right", "sure", 2)]).sure).toEqual({ n: 1, right: 1 });
  });
});

describe("calibrationLine", () => {
  const empty = { n: 0, right: 0 };
  it("says nothing until a level has two answers", () => {
    expect(calibrationLine({ sure: { n: 1, right: 1 }, unsure: empty, guess: { n: 1, right: 0 } })).toBeNull();
  });

  it("names Sure and Guessing, each only once it has two answers", () => {
    expect(calibrationLine({ sure: { n: 6, right: 5 }, unsure: { n: 4, right: 2 }, guess: { n: 3, right: 1 } })).toBe(
      "When you were Sure you were right 5 of 6 times; when Guessing, 1 of 3.",
    );
    expect(calibrationLine({ sure: { n: 2, right: 2 }, unsure: empty, guess: { n: 1, right: 0 } })).toBe("When you were Sure you were right 2 of 2 times.");
    expect(calibrationLine({ sure: empty, unsure: empty, guess: { n: 3, right: 0 } })).toBe("When Guessing you were right 0 of 3 times.");
  });

  it("leaves Unsure out, since unrated multiple choice counts as Unsure", () => {
    expect(calibrationLine({ sure: empty, unsure: { n: 5, right: 3 }, guess: empty })).toBeNull();
  });
});

describe("confidentMisses", () => {
  const items = ["a", "b", "c", "d"].map(item);

  it("lists questions whose latest answer was a sure miss, most recent first", () => {
    const out = confidentMisses(
      [
        attempt("a", "wrong", "sure", 10),
        attempt("b", "wrong", "sure", 30),
        attempt("c", "wrong", "unsure", 20),
        attempt("d", "partly", "sure", 40),
      ],
      items,
    );
    expect(out.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("drops a miss once a later answer fixes it, ignoring explain-backs", () => {
    const out = confidentMisses(
      [
        attempt("a", "wrong", "sure", 10),
        attempt("a", "right", "unsure", 20),
        attempt("b", "wrong", "sure", 10),
        attempt("b", "right", "sure", 20, { mode: "explain" }),
      ],
      items,
    );
    expect(out.map((i) => i.id)).toEqual(["b"]);
  });

  it("leaves out a pretest miss, where Sure is only the default", () => {
    const out = confidentMisses(
      [
        attempt("a", "wrong", "sure", 10, { mode: "gauge" }),
        attempt("b", "wrong", "sure", 10, { mode: "practice" }),
        attempt("b", "wrong", "sure", 20, { mode: "gauge" }),
      ],
      items,
    );
    expect(out).toEqual([]);
  });

  it("only returns questions it was given", () => {
    expect(confidentMisses([attempt("zzz", "wrong", "sure", 1)], items)).toEqual([]);
  });
});
