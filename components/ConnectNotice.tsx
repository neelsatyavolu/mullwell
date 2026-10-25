"use client";
import Link from "next/link";
import { useAiStatus } from "@/lib/client/status";

/** Shown wherever AI is needed but nothing is connected yet. */
export function ConnectNotice({ force }: { force?: boolean }) {
  const { status, loading } = useAiStatus();
  const connected = status && (status.connected.codex || status.connected.grok);
  if (loading || (connected && !force)) return null;
  return (
    <div className="notice row" style={{ justifyContent: "space-between" }}>
      <span>Connect your ChatGPT or Grok subscription to start. Mullwell runs on your own plan, so there&apos;s nothing extra to pay.</span>
      <Link className="btn btn-sm btn-primary" href="/settings">Connect</Link>
    </div>
  );
}
