import { AppError } from "@/lib/errors";

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
const MAX_OFFSET = 2_147_483_647; // SQL integer

export interface PageParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginationMeta {
  current_page: number;
  page_size: number;
  total_records: number;
  total_pages: number;
}

function parseIntParam(
  value: string | null,
  name: string,
  fallback: number,
): number {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) {
    throw new AppError(
      "INVALID_PAGINATION",
      `${name} must be a positive integer`,
      { details: [{ field: name, message: `${name} must be a positive integer` }] },
    );
  }
  return Number(value);
}

export function parsePagination(params: URLSearchParams): PageParams {
  const page = parseIntParam(params.get("page"), "page", DEFAULT_PAGE);
  const limit = parseIntParam(params.get("limit"), "limit", DEFAULT_LIMIT);

  if (page < 1) {
    throw new AppError("INVALID_PAGINATION", "page must be >= 1", {
      details: [{ field: "page", message: "page must be >= 1" }],
    });
  }
  if (limit < 1 || limit > MAX_LIMIT) {
    throw new AppError(
      "INVALID_PAGINATION",
      `limit must be between 1 and ${MAX_LIMIT}`,
      {
        details: [
          { field: "limit", message: `limit must be between 1 and ${MAX_LIMIT}` },
        ],
      },
    );
  }

  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset) || offset > MAX_OFFSET) {
    throw new AppError("INVALID_PAGINATION", "page is too large", {
      details: [{ field: "page", message: "page is too large" }],
    });
  }
  return { page, limit, offset };
}

export function buildPaginationMeta(
  page: PageParams,
  totalRecords: number,
): PaginationMeta {
  return {
    current_page: page.page,
    page_size: page.limit,
    total_records: totalRecords,
    total_pages: Math.ceil(totalRecords / page.limit),
  };
}
