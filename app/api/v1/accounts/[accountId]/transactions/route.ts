import { requireAuth } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { ok, okList, readJsonBody, route } from "@/lib/http";
import { parsePagination } from "@/lib/pagination";
import { listTransactions, withdraw } from "@/lib/services/ledger";
import {
  createTransactionSchema,
  parseAccountId,
  parseTypeFilter,
  withdrawSchema,
} from "@/lib/validation";

type Ctx = { params: Promise<{ accountId: string }> };

/**
 * POST /api/v1/accounts/:accountId/transactions
 *
 * Users may only withdraw (debit). Credits are admin-only (`CREDIT_FORBIDDEN`).
 * Accepts either `{ amount, reference_id, description? }` (preferred) or the
 * legacy `{ type: "debit", ... }` shape so older clients keep working.
 */
export const POST = route<Ctx>(async (request, { params }) => {
  const auth = await requireAuth(request);
  const accountId = parseAccountId((await params).accountId);
  const body = await readJsonBody(request);

  // Explicit credit attempts get a clear 403 (not a validation error).
  if (body && typeof body === "object" && !Array.isArray(body) && "type" in body) {
    const typed = createTransactionSchema.parse(body);
    if (typed.type === "credit") {
      throw new AppError(
        "CREDIT_FORBIDDEN",
        "Only an administrator can add money to an account",
      );
    }
    return ok(
      await withdraw(auth.userId, accountId, {
        amount: typed.amount,
        description: typed.description,
        reference_id: typed.reference_id,
      }),
      201,
    );
  }

  const input = withdrawSchema.parse(body);
  return ok(await withdraw(auth.userId, accountId, input), 201);
});

/** GET /api/v1/accounts/:accountId/transactions?type=&page=&limit= */
export const GET = route<Ctx>(async (request, { params }) => {
  const auth = await requireAuth(request);
  const accountId = parseAccountId((await params).accountId);
  const { searchParams } = new URL(request.url);
  const type = parseTypeFilter(searchParams.get("type"));
  const page = parsePagination(searchParams);
  const { items, pagination } = await listTransactions(
    auth.userId,
    accountId,
    type,
    page,
  );
  return okList(items, pagination);
});
