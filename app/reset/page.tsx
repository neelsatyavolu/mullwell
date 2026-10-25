"use client";
import { hardNavigate } from "@/lib/client/navigate";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthCard, ErrorNote, Link, postJson, useSubmit } from "@/components/AuthForm";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const { busy, error, run } = useSubmit();
  if (!token) {
    return (
      <AuthCard title="Reset link missing" footer={<Link href="/login">Back to sign in</Link>}>
        <p className="muted">Open the link from your email again, or <Link href="/forgot">request a new one</Link>.</p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password" subtitle="This signs you out everywhere else.">
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => postJson("/api/account/reset", { token, password }))) hardNavigate("/");
      }}>
        <label className="field">
          <span>New password</span>
          <input className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          <span className="small faint">At least 8 characters.</span>
        </label>
        <ErrorNote error={error} />
        {error?.includes("no longer valid") && <p className="small"><Link href="/forgot">Request a new link</Link></p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Saving…" : "Save password and sign in"}</button>
      </form>
    </AuthCard>
  );
}

export default function ResetPage() {
  return <Suspense><ResetForm /></Suspense>;
}
