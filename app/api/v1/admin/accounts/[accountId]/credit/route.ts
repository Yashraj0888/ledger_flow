import { requireAdmin } from "@/lib/auth/admin";
import { ok, readJsonBody, route } from "@/lib/http";
import { adminCredit } from "@/lib/services/ledger";
import { adminCreditSchema, parseAccountId } from "@/lib/validation";

type Ctx = { params: Promise<{ accountId: string }> };

/**
 * POST /api/v1/admin/accounts/:accountId/credit
 * The only way new money enters the ledger. Admin cannot withdraw or transfer.
 */
export const POST = route<Ctx>(async (request, { params }) => {
  await requireAdmin(request);
  const accountId = parseAccountId((await params).accountId);
  const input = adminCreditSchema.parse(await readJsonBody(request));
  return ok(await adminCredit(accountId, input), 201);
});
