import { describe, expect, it } from "vitest";
import { keyToAction, type KeyContext, type KeyPress } from "./keys";

const press = (key: string, more: Partial<KeyPress> = {}): KeyPress => ({ key, target: "page", mod: false, ...more });
const mcq: KeyContext = { kind: "mcq", phase: "answering", choices: 4, canCheck: false };
const short: KeyContext = { kind: "short", phase: "answering", choices: 0, canCheck: false };

describe("keyToAction", () => {
  it("picks a choice by letter or digit, by display position", () => {
    expect(keyToAction(press("b"), mcq)).toEqual({ type: "choose", index: 1 });
    expect(keyToAction(press("B"), mcq)).toEqual({ type: "choose", index: 1 });
    expect(keyToAction(press("1"), mcq)).toEqual({ type: "choose", index: 0 });
    expect(keyToAction(press("d"), mcq)).toEqual({ type: "choose", index: 3 });
  });

  it("ignores choice keys past the last choice and on other kinds", () => {
    expect(keyToAction(press("e"), mcq)).toBeNull();
    expect(keyToAction(press("5"), mcq)).toBeNull();
    expect(keyToAction(press("a"), short)).toBeNull();
    expect(keyToAction(press("1"), short)).toBeNull();
  });

  it("sets confidence with g, u and s on every kind", () => {
    expect(keyToAction(press("g"), mcq)).toEqual({ type: "confidence", confidence: "guess" });
    expect(keyToAction(press("U"), short)).toEqual({ type: "confidence", confidence: "unsure" });
    expect(keyToAction(press("s"), short)).toEqual({ type: "confidence", confidence: "sure" });
  });

  it("checks on Enter only when the answer can be checked", () => {
    expect(keyToAction(press("Enter"), mcq)).toBeNull();
    expect(keyToAction(press("Enter"), { ...mcq, canCheck: true })).toEqual({ type: "check" });
  });

  it("leaves Enter to a focused button, except a selected choice or pill", () => {
    expect(keyToAction(press("Enter", { target: "button" }), { ...mcq, canCheck: true })).toBeNull();
    expect(keyToAction(press("b", { target: "button" }), mcq)).toEqual({ type: "choose", index: 1 });
  });

  it("checks from the one-line input on Enter, and from a textarea only with Cmd/Ctrl", () => {
    const ready = { ...short, canCheck: true };
    expect(keyToAction(press("Enter", { target: "input" }), ready)).toEqual({ type: "check" });
    expect(keyToAction(press("Enter", { target: "textarea" }), ready)).toBeNull();
    expect(keyToAction(press("Enter", { target: "textarea", mod: true }), ready)).toEqual({ type: "check" });
    expect(keyToAction(press("Enter", { target: "textarea", mod: true }), short)).toBeNull();
  });

  it("never steals typing in a text box", () => {
    expect(keyToAction(press("g", { target: "input" }), short)).toBeNull();
    expect(keyToAction(press("s", { target: "textarea" }), short)).toBeNull();
    expect(keyToAction(press("n", { target: "textarea" }), { ...short, phase: "graded" })).toBeNull();
  });

  it("leaves shortcuts with modifier keys alone", () => {
    expect(keyToAction(press("c", { mod: true }), mcq)).toBeNull();
    expect(keyToAction(press("s", { mod: true }), mcq)).toBeNull();
  });

  it("moves on with n once graded, and does nothing else then", () => {
    const graded = { ...mcq, phase: "graded" as const };
    expect(keyToAction(press("n"), graded)).toEqual({ type: "next" });
    expect(keyToAction(press("b"), graded)).toBeNull();
    expect(keyToAction(press("g"), graded)).toBeNull();
    expect(keyToAction(press("n"), mcq)).toBeNull();
    expect(keyToAction(press("n"), { ...mcq, phase: "grading" })).toBeNull();
  });
});
