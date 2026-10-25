"use client";
import Link from "next/link";
import { useState } from "react";

// The shared card for sign-in, sign-up, forgot and reset.

export async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string; message?: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, ...json } : { ok: false, error: json.error ?? `Something went wrong (${res.status}).` };
  } catch {
    return { ok: false, error: "Couldn't reach Mullwell. Check your connection." };
  }
}

/** Only same-site paths are followed after sign-in. */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="page" style={{ maxWidth: 440 }}>
      <div className="stack" style={{ gap: 24, marginTop: 24 }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="display" style={{ fontSize: 30, lineHeight: "36px" }}>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        <div className="card stack">{children}</div>
        {footer && <div className="small muted" style={{ textAlign: "center" }}>{footer}</div>}
      </div>
    </main>
  );
}

export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(work: () => Promise<{ ok: boolean; error?: string }>): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const result = await work();
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Something went wrong.");
    return result.ok;
  }
  return { busy, error, run };
}

export function ErrorNote({ error }: { error: string | null }) {
  return error ? <p className="notice notice-bad" role="alert">{error}</p> : null;
}

export { Link };
