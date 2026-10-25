import { handle, ok } from "@/lib/api";
import { clearAllSessions } from "@/lib/ai/session";
import { endSession } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

// POST /api/account/logout: sign out and drop this browser's AI connection cookies.
export function POST(req: Request) {
  return handle(req, async () => {
    await clearAllSessions();
    await endSession();
    return ok({});
  });
}
