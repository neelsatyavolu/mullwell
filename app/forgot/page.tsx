"use client";
import { useState } from "react";
import { AuthCard, ErrorNote, Link, postJson, useSubmit } from "@/components/AuthForm";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const { busy, error, run } = useSubmit();
  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a link to choose a new one." footer={<Link href="/login">Back to sign in</Link>}>
      {sent ? (
        <p className="muted" role="status">{sent} Check your inbox (and spam folder). The link works for an hour.</p>
      ) : (
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          let message = "";
          if (await run(async () => {
            const r = await postJson("/api/account/forgot", { email });
            message = r.message ?? "";
            return r;
          })) setSent(message);
        }}>
          <label className="field"><span>Email</span><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
          <ErrorNote error={error} />
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
        </form>
      )}
    </AuthCard>
  );
}
