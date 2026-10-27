import { requireAuth } from "@/lib/auth/session";
import { ok, readJsonBody, route } from "@/lib/http";
import { transferFunds } from "@/lib/services/ledger";
import { createTransferSchema } from "@/lib/validation";

/**
 * POST /api/v1/transfers — atomically move money from one of the caller's
 * accounts to any other account (own or another user's).
 */
export const POST = route(async (request) => {
  const auth = await requireAuth(request);
  const input = createTransferSchema.parse(await readJsonBody(request));
  return ok(await transferFunds(auth.userId, input), 201);
});
