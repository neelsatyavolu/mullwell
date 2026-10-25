import { describe, expect, it } from "vitest";
import { locateQuote, matchQuote, normalize } from "./quote";

const text = "The mitochondrion is the site of aerobic respiration, producing most of the cell’s ATP via oxidative phosphorylation.";

describe("matchQuote", () => {
  it("matches exactly despite case, punctuation and quote styles", () => {
    expect(matchQuote("producing most of the cell's ATP", text)).toBe("exact");
  });

  it("accepts a quote with a filler word changed, but not a content word", () => {
    expect(matchQuote("is the site of aerobic respiration, producing most of a cell's ATP via oxidative phosphorylation", text)).toBe("close");
    expect(matchQuote("the site of aerobic respiration, producing most of the cell's ATP through oxidative phosphorylation", text)).toBeNull();
    expect(matchQuote("the site of anaerobic respiration, producing most of the cell's ATP via oxidative phosphorylation", text)).toBeNull();
  });

  it("rejects invented quotes and very short ones", () => {
    expect(matchQuote("the nucleus stores genetic information for the cell", text)).toBeNull();
    expect(matchQuote("ATP", text)).toBeNull();
  });

  it("does not match a partial word", () => {
    expect(matchQuote("hondrion is the", text)).toBeNull();
  });
});

describe("locateQuote", () => {
  const sections = [
    { id: 1, title: "a", text: "Plants use chlorophyll to capture light energy." },
    { id: 2, title: "b", text },
  ];
  it("keeps the cited section or finds the right one", () => {
    expect(locateQuote("is the site of aerobic respiration", 2, sections)).toBe(2);
    expect(locateQuote("is the site of aerobic respiration", 1, sections)).toBe(2);
    expect(locateQuote("made up words that appear nowhere", 1, sections)).toBeNull();
  });
});

it("normalize strips accents", () => {
  expect(normalize("Café — “Déjà”")).toBe("cafe deja");
});
