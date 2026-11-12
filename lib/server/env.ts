import "server-only";
import { z } from "zod";

// Server configuration, checked once. Outside production the database falls
// back to an on-disk PGlite and the site address to localhost, so local
// development needs no services.

const schema = z.object({
  MULLWELL_SECRET: z.string().min(16, "MULLWELL_SECRET must be at least 16 characters"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url(),
  RESEND_API_KEY: z.string().min(1).optional(),
  // Xanom sign-in. Without all three the "Continue with Xanom" flow answers "unavailable".
  XANOM_ISSUER: z.url().optional(),
  XANOM_CLIENT_ID: z.string().min(1).optional(),
  XANOM_CLIENT_SECRET: z.string().min(16).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const production = process.env.NODE_ENV === "production";
  const parsed = schema.safeParse({
    MULLWELL_SECRET: process.env.MULLWELL_SECRET,
    DATABASE_URL: process.env.DATABASE_URL ?? (production ? undefined : "pglite://.data/mullwell"),
    APP_URL: process.env.APP_URL ?? (production ? undefined : "http://localhost:3000"),
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    XANOM_ISSUER: process.env.XANOM_ISSUER || undefined,
    XANOM_CLIENT_ID: process.env.XANOM_CLIENT_ID || undefined,
    XANOM_CLIENT_SECRET: process.env.XANOM_CLIENT_SECRET || undefined,
  });
  if (!parsed.success) throw new Error(`Server misconfigured: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  cached = parsed.data;
  return cached;
}
