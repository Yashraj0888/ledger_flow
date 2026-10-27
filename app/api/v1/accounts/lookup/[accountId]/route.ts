import { requireAuth } from "@/lib/auth/session";
import { ok, route } from "@/lib/http";
import { lookupAccount } from "@/lib/services/ledger";
import { parseAccountId } from "@/lib/validation";

type Ctx = { params: Promise<{ accountId: string }> };

/**
 * GET /api/v1/accounts/lookup/:accountId
 * Confirm a destination before transferring. Returns name + owner username only
 * (never the balance).
 */
export const GET = route<Ctx>(async (request, { params }) => {
  await requireAuth(request);
  const accountId = parseAccountId((await params).accountId);
  return ok(await lookupAccount(accountId));
});
