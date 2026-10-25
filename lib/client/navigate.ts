"use client";

/**
 * A full page load, used whenever the signed-in account changes (sign in,
 * sign out, session ended), so no in-memory data from the previous account
 * survives. Client-side routing would keep it.
 */
export function hardNavigate(path: string) {
  window.location.href = path;
}
