"use client";
import { hardNavigate } from "@/lib/client/navigate";
import { useRef, useState } from "react";
import { readPrefs, STUDY_DEFAULTS, STUDY_MAX, studyLimit, usePrefs, writePrefs, type Prefs, type Provider } from "@/lib/client/ai";
import { refreshStatus, useAiStatus } from "@/lib/client/status";
import { confirmDialog } from "@/components/Dialog";
import { getAccount, getLibrary, importLibrary, useLibrary, useSyncState, type SyncState } from "@/lib/client/store";
import { emptyLibrary, type Library } from "@/lib/client/db";
import { makeBackup, readBackup } from "@/lib/study/backup";

const NAMES: Record<Provider, string> = { codex: "ChatGPT", grok: "Grok" };
const HOW: Record<Provider, string> = {
  codex: "Sign in with your ChatGPT account. When the browser lands on a page that won't load (localhost:1455), copy that whole address from the address bar and paste it here.",
  grok: "Sign in with your X / Grok account, then copy the code it shows you and paste it here.",
};

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status}).`);
  return json;
}

function ProviderCard({ provider, connected, prefs, setPrefs, models }: { provider: Provider; connected: boolean; prefs: Prefs; setPrefs: (p: Prefs) => void; models: { id: string; label: string }[] }) {
  const [pending, setPending] = useState(false);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = prefs.provider === provider;

  async function start() {
    setError(null);
    // Open the window first so pop-up blockers allow it.
    const win = window.open("about:blank", "_blank");
    try {
      const { authorizeUrl } = await post(`/api/ai/${provider}/start`);
      if (win) win.location.href = authorizeUrl;
      else window.open(authorizeUrl, "_blank", "noopener");
      setPending(true);
    } catch (err) {
      win?.close();
      setError(err instanceof Error ? err.message : "Couldn't start sign-in.");
    }
  }

  async function complete(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post(`/api/ai/${provider}/complete`, { callback: paste.trim() });
      setPending(false);
      setPaste("");
      setPrefs({ provider });
      refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    await post(`/api/ai/${provider}/logout`).catch(() => {});
    refreshStatus();
  }

  return (
    <div className="card stack">
      <div className="spread">
        <div className="stack" style={{ gap: 2 }}>
          <h3 className="heading">{NAMES[provider]}</h3>
          <span className="small faint">{connected ? (active ? "Connected · in use" : "Connected") : "Not connected"}</span>
        </div>
        <div className="row">
          {connected && !active && <button className="btn btn-sm" onClick={() => setPrefs({ provider })}>Use this</button>}
          {connected ? <button className="btn btn-sm btn-ghost" onClick={() => void disconnect()}>Disconnect</button> : !pending && <button className="btn btn-primary btn-sm" onClick={() => void start()}>Connect</button>}
        </div>
      </div>
      {connected && active && models.length > 0 && (
        <label className="field">
          <span>Model for notes and the tutor (quick steps use the fast model)</span>
          <select className="select" value={prefs.model ?? models[0].id} onChange={(e) => setPrefs({ provider, model: e.target.value })}>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
      )}
      {pending && !connected && (
        <form className="stack" onSubmit={complete}>
          <p className="small muted">{HOW[provider]}</p>
          <input className="input" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={provider === "codex" ? "http://localhost:1455/auth/callback?code=…" : "Paste the code"} aria-label="Sign-in link or code" autoFocus />
          <div className="row">
            <button className="btn btn-primary" disabled={!paste.trim() || busy}>{busy ? "Connecting…" : "Finish connecting"}</button>
            <button type="button" className="btn btn-ghost" onClick={() => void start()}>Open sign-in again</button>
          </div>
        </form>
      )}
      {error && <p className="notice notice-bad" role="alert">{error}</p>}
    </div>
  );
}

const SYNC_TEXT: Record<SyncState, string> = {
  synced: "All changes synced",
  pending: "Saving changes…",
  offline: "Offline. Changes are kept on this device and sync when you're back.",
};

function AccountSection() {
  useLibrary();
  const account = getAccount();
  const sync = useSyncState();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function signOut() {
    setBusy(true);
    await post("/api/account/logout").catch(() => {});
    hardNavigate("/login");
  }

  async function signOutEverywhere() {
    setBusy(true);
    try {
      await post("/api/account", { action: "signout-everywhere" });
      setNote("Signed out on every other device.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't do that.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (res?.ok) {
      hardNavigate("/signup");
      return;
    }
    setError(json?.error ?? "Couldn't delete the account.");
    setBusy(false);
  }

  return (
    <section className="stack">
      <p className="label">Account</p>
      <div className="card stack">
        <div className="spread">
          <div className="stack" style={{ gap: 2 }}>
            <span style={{ fontWeight: 600 }}>{account?.email ?? "…"}</span>
            <span className="small faint">Forgot your password? Sign out and use “Forgot password?”.</span>
          </div>
          <button className="btn btn-sm" disabled={busy} onClick={() => void signOut()}>Sign out</button>
        </div>
        <p className="meta row" style={{ gap: 8 }}>
          <span className="dot" style={{ background: sync === "synced" ? "var(--good)" : "var(--warn)" }} aria-hidden />
          {SYNC_TEXT[sync]}
        </p>
        <div className="row">
          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void signOutEverywhere()}>Sign out other devices</button>
          {!deleting && <button className="btn btn-sm btn-ghost btn-danger" onClick={() => setDeleting(true)}>Delete account</button>}
        </div>
        {deleting && (
          <form className="stack inset" onSubmit={deleteAccount}>
            <p className="small">This permanently deletes your account and everything in it: classes, sets, tests and review history. Download a backup first if you want to keep anything.</p>
            <input className="input" type="password" autoComplete="current-password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" />
            <div className="row">
              <button className="btn btn-sm btn-danger" disabled={!password || busy}>Delete forever</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDeleting(false)}>Cancel</button>
            </div>
          </form>
        )}
        {note && <p className="small muted" role="status">{note}</p>}
        {error && <p className="notice notice-bad" role="alert">{error}</p>}
      </div>
    </section>
  );
}

/** A number box that saves each valid value as it's typed and shows the saved one again on blur. */
function StudyField({ label, value, min, onSave }: { label: string; value: number; min: number; onSave: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="field" style={{ flex: "1 1 200px" }}>
      <span>{label}</span>
      <input
        className="input num"
        type="number"
        inputMode="numeric"
        min={min}
        max={STUDY_MAX}
        step={1}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = e.target.value.trim() === "" ? undefined : studyLimit(Number(e.target.value), min);
          if (n !== undefined) onSave(n);
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  );
}

function StudySection() {
  const prefs = usePrefs();
  const save = (patch: Partial<Prefs>) => writePrefs({ ...readPrefs(), ...patch });
  return (
    <section className="stack">
      <div className="stack" style={{ gap: 4 }}>
        <p className="label">Study</p>
        <p className="small muted">How much goes into Today&apos;s session. When more is due than fits, reviews come first.</p>
      </div>
      <div className="card row" style={{ alignItems: "flex-end", gap: 16 }}>
        <StudyField label="New questions per day" value={prefs.studyNewPerDay ?? STUDY_DEFAULTS.newPerDay} min={0} onSave={(n) => save({ studyNewPerDay: n })} />
        <StudyField label="Most cards in one session" value={prefs.studyCap ?? STUDY_DEFAULTS.cap} min={1} onSave={(n) => save({ studyCap: n })} />
      </div>
    </section>
  );
}

export default function Settings() {
  const { status } = useAiStatus();
  const prefs = usePrefs();
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Provider changes replace the AI fields only; the study fields stay.
  const setPrefs = (p: Prefs) => {
    const { studyNewPerDay, studyCap } = readPrefs();
    writePrefs({ ...p, studyNewPerDay, studyCap });
  };

  function exportBackup() {
    const blob = new Blob([JSON.stringify(makeBackup(getLibrary() as unknown as Parameters<typeof makeBackup>[0]))], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mullwell-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function restore(file: File) {
    const parsed = readBackup(await file.text());
    if (!parsed.ok) return setMessage(parsed.error);
    const ok = await confirmDialog({
      title: "Restore this backup?",
      body: "Everything in your account is replaced with the backup, on every device. This can't be undone.",
      confirmLabel: "Replace everything",
      danger: true,
    });
    if (!ok) return;
    await importLibrary({ ...emptyLibrary(), ...(parsed.backup.data as unknown as Library) });
    setMessage("Backup restored.");
  }

  return (
    <main className="page page-narrow stack" style={{ gap: 32 }}>
      <h1 className="title">Settings</h1>
      <AccountSection />
      <section className="stack">
        <div className="stack" style={{ gap: 4 }}>
          <p className="label">AI</p>
          <p className="small muted">Mullwell uses your own ChatGPT or Grok subscription. Its sign-in tokens are encrypted, kept only in this browser&apos;s cookies, tied to your Mullwell account, and never stored on our servers. Connect once per device.</p>
        </div>
        {(["codex", "grok"] as const).map((p) => (
          <ProviderCard key={p} provider={p} connected={Boolean(status?.connected[p])} prefs={prefs} setPrefs={setPrefs} models={status?.models[p] ?? []} />
        ))}
      </section>
      <StudySection />
      <section className="stack">
        <div className="stack" style={{ gap: 4 }}>
          <p className="label">Your data</p>
          <p className="small muted">Your classes, sets and review history are saved to your account and sync across devices. A copy stays in this browser so it opens fast and keeps working if your connection drops. You can also download a backup file.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={exportBackup}>Download backup</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Restore from backup</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && void restore(e.target.files[0])} />
        </div>
        {message && <p className="small muted" role="status">{message}</p>}
      </section>
    </main>
  );
}
