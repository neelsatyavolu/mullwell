import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE, sessionKey } from "@/lib/account/session";

// Every page needs an account. This checks only the session's signature and
// expiry (no database read); the API checks the account itself, so a session
// ended by a password reset gets no data even if a page shell loads.

const PUBLIC_PAGES = new Set(["/login", "/signup", "/forgot", "/reset"]);

let key: Buffer | null = null;

export function proxy(request: NextRequest) {
  const secret = process.env.MULLWELL_SECRET;
  if (!secret) return new NextResponse("Server misconfigured", { status: 500 });
  key ??= sessionKey(secret);
  const { pathname, search } = request.nextUrl;
  const signedIn = readSession(key, request.cookies.get(SESSION_COOKIE)?.value, Date.now()) !== null;
  if (PUBLIC_PAGES.has(pathname)) {
    return signedIn && pathname !== "/reset" ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }
  if (signedIn) return NextResponse.next();
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Pages only: not the API, Next's assets, the link preview, or any file with an extension (icons, manifest, PDF worker).
  matcher: ["/((?!api|_next/static|_next/image|opengraph-image|.*\\..*).*)"],
};
