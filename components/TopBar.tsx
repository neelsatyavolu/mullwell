"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLibrary } from "@/lib/client/store";
import { dueItems } from "@/lib/client/derived";

const AUTH_PAGES = new Set(["/login", "/signup", "/forgot", "/reset"]);

function Wordmark() {
  return (
    <Link href="/" className="wordmark">
      <span className="wordmark-dot" aria-hidden />
      Mullwell
    </Link>
  );
}

function AppNav({ path }: { path: string }) {
  const { library } = useLibrary();
  const due = dueItems(library).length;
  const current = (href: string) => ((href === "/" ? path === "/" : path.startsWith(href)) ? "page" : undefined);
  return (
    <>
      <Link href="/" className="navlink" aria-current={current("/")}>Today</Link>
      <Link href="/review" className="navlink" aria-current={current("/review")}>
        Review
        {due > 0 && <span className="chip chip-accent num" aria-label={`${due} due`}>{due}</span>}
      </Link>
      <Link href="/settings" className="navlink" aria-current={current("/settings")}>Settings</Link>
    </>
  );
}

export function TopBar() {
  const path = usePathname();
  return (
    <header className="topbar">
      <nav className="topbar-inner" aria-label="Main">
        <Wordmark />
        {/* Auth pages must not load the library: that needs an account and would redirect here again. */}
        {!AUTH_PAGES.has(path) && <AppNav path={path} />}
      </nav>
    </header>
  );
}
