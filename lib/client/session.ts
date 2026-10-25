"use client";

// Small per-tab state (a test draft, a lesson position) kept in sessionStorage
// so a refresh doesn't lose it. Storage can be blocked or full, so every call
// fails quietly: losing this state only means starting the screen over.

export function readSession(key: string): unknown {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked or full */
  }
}

export function clearSession(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* storage blocked */
  }
}

export const testDraftKey = (examId: string) => `mw:test:${examId}`;
export const lessonKey = (setId: string) => `mw:lesson:${setId}`;
export const gaugeKey = (setId: string) => `mw:gauge:${setId}`;
