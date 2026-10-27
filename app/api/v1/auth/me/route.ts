import { requireAuth } from "@/lib/auth/session";
import { ok, route } from "@/lib/http";

/** GET /api/v1/auth/me — current user (display name + login username). */
export const GET = route(async (request) => {
  const auth = await requireAuth(request);
  return ok({ id: auth.userId, username: auth.username, name: auth.name });
});
