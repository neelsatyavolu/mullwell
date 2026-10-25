"use client";
import { useEffect, useState } from "react";
import { formatElapsed } from "@/lib/study/run";

// The strip that stays under the top bar while a practice test is taken: how
// many are answered, the time so far, and a chip per question to jump to it.

type Props = {
  /** One flag per question, in order: answered or still blank. */
  answered: boolean[];
  started: number;
  /** False once the test is submitted, so the timer stops. */
  running: boolean;
};

export function TestNavigator({ answered, started, running }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const done = answered.filter(Boolean).length;
  const jump = (n: number) => {
    const el = document.getElementById(`q-${n}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    el?.focus({ preventScroll: true });
  };

  return (
    <nav className="test-nav" aria-label="Questions">
      <div className="spread small">
        <span className="num">{done} of {answered.length} answered</span>
        <span className="num muted" role="timer" aria-live="off"><span className="sr-only">Time so far </span>{formatElapsed(now - started)}</span>
      </div>
      <div className="progress"><span style={{ width: `${(done / Math.max(1, answered.length)) * 100}%` }} /></div>
      <div className="qchips">
        {answered.map((a, n) => (
          <button key={n} type="button" className={`chip num qchip${a ? " is-answered" : ""}`} onClick={() => jump(n + 1)} aria-label={`Question ${n + 1}, ${a ? "answered" : "blank"}`}>
            {n + 1}
          </button>
        ))}
      </div>
    </nav>
  );
}
