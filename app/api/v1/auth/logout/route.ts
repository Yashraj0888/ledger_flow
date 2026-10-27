import { clearedSessionCookie, requireAuth } from "@/lib/auth/session";
import { ok, route } from "@/lib/http";
import { logout } from "@/lib/services/auth";

/** POST /api/v1/auth/logout - revoke the current session and clear the cookie. */
export const POST = route(async (request) => {
  const auth = await requireAuth(request);
  await logout(auth.sessionId);
  return ok({ logged_out: true }, 200, {
    "Set-Cookie": clearedSessionCookie(),
  });
});
