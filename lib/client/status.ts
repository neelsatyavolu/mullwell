"use client";
import { useEffect, useState } from "react";

// Which providers this browser has connected, fetched once per page load and
// refreshed after connecting or disconnecting.

export type Status = { connected: { codex: boolean; grok: boolean }; models: Record<"codex" | "grok", { id: string; label: string }[]> };

let cached: Promise<Status | null> | null = null;
const listeners = new Set<(s: Status | null) => void>();

function load(): Promise<Status | null> {
  cached ??= fetch("/api/ai/status", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return cached;
}

export function refreshStatus() {
  cached = null;
  void load().then((s) => listeners.forEach((l) => l(s)));
}

export function useAiStatus(): { status: Status | null; loading: boolean } {
  const [state, setState] = useState<{ status: Status | null; loading: boolean }>({ status: null, loading: true });
  useEffect(() => {
    let live = true;
    const on = (status: Status | null) => live && setState({ status, loading: false });
    listeners.add(on);
    void load().then(on);
    return () => {
      live = false;
      listeners.delete(on);
    };
  }, []);
  return state;
}
