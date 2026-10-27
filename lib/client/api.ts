export interface Pagination {
  current_page: number;
  page_size: number;
  total_records: number;
  total_pages: number;
}

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field-level validation messages, keyed by field name. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) {
      for (const item of this.details as FieldError[]) {
        if (item?.field && !(item.field in out)) out[item.field] = item.message;
      }
    }
    return out;
  }
}

let onUnauthorized: (() => void) | undefined;

/** Registered once by the auth provider; called when a session is rejected. */
export function setUnauthorizedHandler(handler: (() => void) | undefined) {
  onUnauthorized = handler;
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  /** Do not trigger the global "session expired" handling on 401. */
  skipAuthRedirect?: boolean;
}

export interface ApiResult<T> {
  data: T;
  pagination?: Pagination;
}

/** Typed same-origin call to the LedgerFlow API (session travels in an HttpOnly cookie). */
export async function api<T>(
  path: string,
  { method = "GET", body, signal, skipAuthRedirect }: RequestOptions = {},
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK_ERROR", "Can't reach the server. Check your connection.");
  }

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const err = json?.error;
    const apiError = new ApiError(
      response.status,
      err?.code ?? "INTERNAL_ERROR",
      err?.message ?? "Something went wrong",
      err?.details,
    );
    if (apiError.code === "UNAUTHENTICATED" && !skipAuthRedirect) onUnauthorized?.();
    throw apiError;
  }

  return { data: json.data as T, pagination: json.pagination };
}

// ------------------------------------------------------------------ types

export interface User {
  id: string;
  username: string;
}

export interface Account {
  id: string;
  name: string;
  balance: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  account_id: string;
  type: "credit" | "debit";
  amount: string;
  description: string | null;
  reference_id: string;
  transfer_id: string | null;
  created_at: string;
}

export interface TransferResult {
  id: string;
  from_account_id: string;
  to_account_id: string;
  amount: string;
  description: string | null;
  reference_id: string;
  created_at: string;
  from_balance: string;
  to_balance: string;
}

/** Fetch every account of the logged-in user (follows pagination). */
export async function fetchAllAccounts(signal?: AbortSignal): Promise<Account[]> {
  const all: Account[] = [];
  let page = 1;
  for (;;) {
    const { data, pagination } = await api<Account[]>(`/accounts?page=${page}&limit=100`, { signal });
    all.push(...data);
    if (!pagination || page >= pagination.total_pages || page >= 20) break;
    page += 1;
  }
  return all;
}
