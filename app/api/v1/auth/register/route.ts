import { ok, readJsonBody, route } from "@/lib/http";
import { registerUser } from "@/lib/services/auth";
import { registerSchema } from "@/lib/validation";

/** POST /api/v1/auth/register - create a user (username + password + MPIN). */
export const POST = route(async (request) => {
  const input = registerSchema.parse(await readJsonBody(request));
  const user = await registerUser(input);
  return ok(user, 201);
});
