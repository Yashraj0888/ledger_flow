import { requireAuth } from "@/lib/auth/session";
import { ok, okList, readJsonBody, route } from "@/lib/http";
import { parsePagination } from "@/lib/pagination";
import { createAccount, listAccounts } from "@/lib/services/ledger";
import { createAccountSchema } from "@/lib/validation";

/** POST /api/v1/accounts - create an account owned by the caller (balance = 0). */
export const POST = route(async (request) => {
  const auth = await requireAuth(request);
  const input = createAccountSchema.parse(await readJsonBody(request));
  return ok(await createAccount(auth.userId, input.name), 201);
});

/** GET /api/v1/accounts - list the caller's own accounts (paginated). */
export const GET = route(async (request) => {
  const auth = await requireAuth(request);
  const { searchParams } = new URL(request.url);
  const page = parsePagination(searchParams);
  const { items, pagination } = await listAccounts(auth.userId, page);
  return okList(items, pagination);
});
