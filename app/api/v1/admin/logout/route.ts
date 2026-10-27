import {
  clearedAdminCookie,
  logoutAdmin,
  requireAdmin,
} from "@/lib/auth/admin";
import { ok, route } from "@/lib/http";

/** POST /api/v1/admin/logout */
export const POST = route(async (request) => {
  const { token } = await requireAdmin(request);
  await logoutAdmin(token);
  return ok({ logged_out: true }, 200, { "Set-Cookie": clearedAdminCookie() });
});
