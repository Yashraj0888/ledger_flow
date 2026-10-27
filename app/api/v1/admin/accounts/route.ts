import { requireAdmin } from "@/lib/auth/admin";
import { okList, route } from "@/lib/http";
import { parsePagination } from "@/lib/pagination";
import { adminListAccounts } from "@/lib/services/ledger";

/** GET /api/v1/admin/accounts — every user's accounts (admin only). */
export const GET = route(async (request) => {
  await requireAdmin(request);
  const page = parsePagination(new URL(request.url).searchParams);
  const { items, pagination } = await adminListAccounts(page);
  return okList(items, pagination);
});
