import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { currentUserId } from "./server/auth";

export function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

export function ok<T extends object>(data: T) {
  return NextResponse.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store" } });
}

/** Browsers send Origin on POST; refuse requests another site started. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const host = new URL(origin).host;
    return host === new URL(req.url).host || host === req.headers.get("x-forwarded-host") || host === req.headers.get("host");
  } catch {
    return false;
  }
}

/** The JSON body, validated, or null when missing, malformed or not declared as JSON. */
export async function readBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S> | null> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return null;
  try {
    const parsed = schema.safeParse(await req.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Runs a handler, mapping validation and unexpected errors to clean JSON responses. */
export async function handle(req: Request, handler: () => Promise<Response>): Promise<Response> {
  if (req.method !== "GET" && !sameOrigin(req)) return fail("Cross-site request refused.", 403);
  try {
    return await handler();
  } catch (err) {
    if (err instanceof ZodError) return fail(err.issues[0]?.message ?? "Invalid request.", 400);
    console.error("[api] unexpected error", err instanceof Error ? err.message : err);
    return fail("Something went wrong. Try again.", 500);
  }
}

/** Like handle, for signed-in users only. */
export function withUser(req: Request, handler: (userId: string) => Promise<Response>): Promise<Response> {
  return handle(req, async () => {
    const userId = await currentUserId();
    if (!userId) return fail("Sign in first.", 401);
    return handler(userId);
  });
}
