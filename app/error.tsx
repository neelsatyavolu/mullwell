"use client";
import Link from "next/link";
import { useEffect } from "react";

// Any page that fails to render. Study data lives in IndexedDB and the
// account, so nothing is lost by trying again.

export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("[page]", error);
  }, [error]);

  return (
    <main className="page page-narrow">
      <div className="empty stack" style={{ alignItems: "center" }} role="alert">
        <h1 className="heading">Something went wrong on this page. Your study data is safe on this device.</h1>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn btn-primary" onClick={() => retry()}>Try again</button>
          <Link href="/" className="btn">Back to Today</Link>
        </div>
      </div>
    </main>
  );
}
