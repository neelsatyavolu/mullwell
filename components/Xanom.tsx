"use client";
import { useSearchParams } from "next/navigation";

// "Continue with Xanom": one account across Xanom apps, run by accounts.xanom.co.

const MESSAGES: Record<string, string> = {
  cancelled: "Xanom sign-in was cancelled.",
  expired: "That Xanom sign-in took too long or was started elsewhere. Try again.",
  failed: "Couldn't finish signing in with Xanom. Try again.",
  unavailable: "Xanom sign-in isn't available right now. Use your email and password.",
  sub_taken: "That Xanom account is already linked to a different Mullwell account.",
  already_linked: "This Mullwell account is already linked to a Xanom account.",
  email_mismatch: "To convert, sign in to Xanom with the same email as this Mullwell account, or use “Link an existing Xanom account”.",
  create_failed: "Couldn't create your account. Try again.",
};

export function xanomStartUrl(intent: "signin" | "link" | "convert", returnTo: string): string {
  return `/api/xanom/start?intent=${intent}&return=${encodeURIComponent(returnTo)}`;
}

/** The error a Xanom round trip came back with, as a sentence, or null. */
export function useXanomError(): string | null {
  const code = useSearchParams().get("xanom_error");
  return code ? (MESSAGES[code] ?? MESSAGES.failed) : null;
}

export function XanomButton({ next }: { next: string }) {
  return (
    <a className="btn btn-primary btn-block" href={xanomStartUrl("signin", next)}>
      Continue with Xanom
    </a>
  );
}

/** The rule between the Xanom button and the email form. */
export function OrDivider({ label }: { label: string }) {
  return (
    <div className="row small faint" style={{ gap: 12 }} aria-hidden>
      <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
      <span>{label}</span>
      <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
    </div>
  );
}

export type AccountDetails = { email: string; hasPassword: boolean; xanom: { email: string } | null };

/** Settings: the linked state, or Convert / Link buttons. */
export function XanomAccount({ details }: { details: AccountDetails | null }) {
  const error = useXanomError();
  const justLinked = useSearchParams().get("xanom") === "linked";
  if (!details) return null;
  if (details.xanom) {
    return (
      <div className="stack inset" style={{ gap: 6 }}>
        <span className="small">Signed in with Xanom · {details.xanom.email}</span>
        {justLinked && <span className="small muted" role="status">Linked. You can now sign in with Xanom.</span>}
        <a className="small" href="https://accounts.xanom.co/" target="_blank" rel="noopener noreferrer">Manage at accounts.xanom.co</a>
        <ErrorText error={error} />
      </div>
    );
  }
  return (
    <div className="stack inset" style={{ gap: 10 }}>
      <p className="small">One Xanom account signs you in to Mullwell and the other Xanom apps. Your classes and sets stay as they are.</p>
      <div className="row">
        <a className="btn btn-sm btn-primary" href={xanomStartUrl("convert", "/settings")}>Convert to Xanom account</a>
        <a className="btn btn-sm btn-ghost" href={xanomStartUrl("link", "/settings")}>Link an existing Xanom account</a>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

function ErrorText({ error }: { error: string | null }) {
  return error ? <p className="notice notice-bad" role="alert">{error}</p> : null;
}
