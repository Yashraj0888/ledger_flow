import { requireAdmin } from "@/lib/auth/admin";
import { getEnv } from "@/lib/env";
import { ok, route } from "@/lib/http";

/** GET /api/v1/admin/me */
export const GET = route(async (request) => {
  await requireAdmin(request);
  return ok({ username: getEnv().ADMIN_USERNAME, role: "admin" as const });
});
