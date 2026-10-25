import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { formatInterval, gradeFor, isDue, newCard, previewIntervals, ratingToVerdict, review } from "./schedule";

const DAY = 86_400_000;

describe("gradeFor", () => {
  it("treats lucky guesses as not yet learned", () => {
    expect(gradeFor("wrong", "sure")).toBe(Rating.Again);
    expect(gradeFor("partly", "sure")).toBe(Rating.Hard);
    expect(gradeFor("right", "guess")).toBe(Rating.Hard);
    expect(gradeFor("right", "unsure")).toBe(Rating.Good);
    expect(gradeFor("right", "sure")).toBe(Rating.Easy);
  });

  it("never grades above a cap, so a pretest can't seed Easy", () => {
    expect(gradeFor("right", "sure", { cap: Rating.Good })).toBe(Rating.Good);
    expect(gradeFor("right", "unsure", { cap: Rating.Good })).toBe(Rating.Good);
    expect(gradeFor("wrong", "sure", { cap: Rating.Good })).toBe(Rating.Again);
    expect(gradeFor("right", "sure", {})).toBe(Rating.Easy);
  });
});

it("ratingToVerdict maps a self-rating to a verdict", () => {
  expect(ratingToVerdict(Rating.Again)).toBe("wrong");
  expect(ratingToVerdict(Rating.Hard)).toBe("partly");
  expect(ratingToVerdict(Rating.Good)).toBe("right");
  expect(ratingToVerdict(Rating.Easy)).toBe("right");
});

describe("review", () => {
  it("brings a missed card back sooner than an easy one", () => {
    const now = Date.UTC(2026, 9, 24);
    const card = newCard(now);
    expect(isDue(card, now)).toBe(true);
    const missed = review(card, Rating.Again, now);
    const easy = review(card, Rating.Easy, now);
    expect(missed.due).toBeLessThan(easy.due);
    expect(easy.due - now).toBeGreaterThanOrEqual(DAY);
    expect(isDue(easy, now)).toBe(false);
    const p = previewIntervals(easy, easy.due);
    expect(p.again).toBeLessThan(p.good);
    expect(p.good).toBeLessThanOrEqual(p.easy);
  });
});

it("formatInterval", () => {
  expect(formatInterval(30_000)).toBe("1 min");
  expect(formatInterval(10 * 60_000)).toBe("10 min");
  expect(formatInterval(5 * 3_600_000)).toBe("5 h");
  expect(formatInterval(3 * DAY)).toBe("3 d");
  expect(formatInterval(90 * DAY)).toBe("3 mo");
  expect(formatInterval(800 * DAY)).toBe("2 y");
});
