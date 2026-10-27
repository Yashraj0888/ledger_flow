import { sessionCookie } from "@/lib/auth/session";
import { ok, readJsonBody, route } from "@/lib/http";
import { login } from "@/lib/services/auth";
import { loginSchema } from "@/lib/validation";

/**
 * POST /api/v1/auth/login
 *   { "method": "password", "username": "...", "password": "..." }
 *   { "method": "mpin",     "username": "...", "mpin": "1234" }
 *
 * Returns the token (for API clients) and also sets it as an HttpOnly cookie
 * (for the browser UI).
 */
export const POST = route(async (request) => {
  const input = loginSchema.parse(await readJsonBody(request));
  const result = await login(input);
  return ok(result, 200, { "Set-Cookie": sessionCookie(result.token) });
});
