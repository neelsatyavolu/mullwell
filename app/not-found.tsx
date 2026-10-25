import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page page-narrow">
      <div className="empty stack" style={{ alignItems: "center" }}>
        <h1 className="heading">This page isn&apos;t here. It may have moved.</h1>
        <Link href="/" className="btn btn-primary">Back to Today</Link>
      </div>
    </main>
  );
}
