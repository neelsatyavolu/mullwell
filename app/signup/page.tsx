"use client";
import { hardNavigate } from "@/lib/client/navigate";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthCard, ErrorNote, Link, postJson, safeNext, useSubmit } from "@/components/AuthForm";

function SignupForm() {
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, run } = useSubmit();
  return (
    <AuthCard
      title="Study smarter with your own notes"
      subtitle="Create a free account. Your classes, sets and reviews sync across your devices."
      footer={<>Already have an account? <Link href="/login">Sign in</Link></>}
    >
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => postJson("/api/account/register", { email, password }))) hardNavigate(next);
      }}>
        <label className="field"><span>Email</span><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          <span className="small faint">At least 8 characters.</span>
        </label>
        <ErrorNote error={error} />
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Creating your account…" : "Create account"}</button>
        <p className="small faint">AI runs on your own ChatGPT or Grok subscription, which you connect after signing up.</p>
      </form>
    </AuthCard>
  );
}

export default function SignupPage() {
  return <Suspense><SignupForm /></Suspense>;
}
