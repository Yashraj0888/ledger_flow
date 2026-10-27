import { requireAuth } from "@/lib/auth/session";
import { ok, okList, readJsonBody, route } from "@/lib/http";
import { parsePagination } from "@/lib/pagination";
import { addTransaction, listTransactions } from "@/lib/services/ledger";
import {
  createTransactionSchema,
  parseAccountId,
  parseTypeFilter,
} from "@/lib/validation";

type Ctx = { params: Promise<{ accountId: string }> };

/** POST /api/v1/accounts/:accountId/transactions - credit or debit. */
export const POST = route<Ctx>(async (request, { params }) => {
  const auth = await requireAuth(request);
  const accountId = parseAccountId((await params).accountId);
  const input = createTransactionSchema.parse(await readJsonBody(request));
  return ok(await addTransaction(auth.userId, accountId, input), 201);
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
