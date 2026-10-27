import { requireAuth } from "@/lib/auth/session";
import { ok, route } from "@/lib/http";
import { getAccount } from "@/lib/services/ledger";
import { parseAccountId } from "@/lib/validation";

type Ctx = { params: Promise<{ accountId: string }> };

/** GET /api/v1/accounts/:accountId - one of the caller's own accounts. */
export const GET = route<Ctx>(async (request, { params }) => {
  const auth = await requireAuth(request);
  const accountId = parseAccountId((await params).accountId);
  return ok(await getAccount(auth.userId, accountId));
});
