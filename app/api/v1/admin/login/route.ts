import { adminCookie, loginAdmin } from "@/lib/auth/admin";
import { ok, readJsonBody, route } from "@/lib/http";
import { adminLoginSchema } from "@/lib/validation";

/** POST /api/v1/admin/login — env-configured admin username + password. */
export const POST = route(async (request) => {
  const input = adminLoginSchema.parse(await readJsonBody(request));
  const result = await loginAdmin(input);
  return ok(result, 200, { "Set-Cookie": adminCookie(result.token) });
});
