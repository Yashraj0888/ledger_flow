import { requireAuth } from "@/lib/auth/session";
import { ok, route } from "@/lib/http";
import { getBalance } from "@/lib/services/ledger";
import { parseAccountId } from "@/lib/validation";

type Ctx = { params: Promise<{ accountId: string }> };

/** GET /api/v1/accounts/:accountId/balance */
export const GET = route<Ctx>(async (request, { params }) => {
  const auth = await requireAuth(request);
  const accountId = parseAccountId((await params).accountId);
  return ok(await getBalance(auth.userId, accountId));
});
