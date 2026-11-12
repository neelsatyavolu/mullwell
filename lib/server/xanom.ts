import "server-only";
import type { XanomConfig } from "../xanom/flow";
import { env } from "./env";

/** Xanom client settings, or null when this deployment has none. */
export function xanomConfig(): XanomConfig | null {
  const { XANOM_ISSUER, XANOM_CLIENT_ID, XANOM_CLIENT_SECRET } = env();
  if (!XANOM_ISSUER || !XANOM_CLIENT_ID || !XANOM_CLIENT_SECRET) return null;
  return { issuer: new URL(XANOM_ISSUER).origin, clientId: XANOM_CLIENT_ID, clientSecret: XANOM_CLIENT_SECRET };
}
