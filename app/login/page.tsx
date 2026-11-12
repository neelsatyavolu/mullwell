"use client";
import { hardNavigate } from "@/lib/client/navigate";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthCard, ErrorNote, Link, postJson, safeNext, useSubmit } from "@/components/AuthForm";
import { OrDivider, useXanomError, XanomButton } from "@/components/Xanom";

function LoginForm() {
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, run } = useSubmit();
  const xanomError = useXanomError();
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
      footer={<>New here? <Link href={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}>Create an account</Link></>}
    >
      <XanomButton next={next} />
      <ErrorNote error={xanomError} />
      <OrDivider label="or sign in with email" />
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        // A full navigation, so every page reloads its data for this account.
        if (await run(() => postJson("/api/account/login", { email, password }))) hardNavigate(next);
      }}>
        <label className="field"><span>Email</span><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field">
          <span className="spread"><span>Password</span><Link href="/forgot" className="small">Forgot password?</Link></span>
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <ErrorNote error={error} />
        <button className="btn btn-block" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
