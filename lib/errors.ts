export type ErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_ACCOUNT_ID"
  | "INVALID_TRANSACTION_TYPE"
  | "INVALID_AMOUNT"
  | "INVALID_PAGINATION"
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "TOO_MANY_ATTEMPTS"
  | "ACCOUNT_NOT_FOUND"
  | "ROUTE_NOT_FOUND"
  | "TRANSACTION_IMMUTABLE"
  | "USERNAME_TAKEN"
  | "DUPLICATE_TRANSACTION"
  | "INSUFFICIENT_BALANCE"
  | "SAME_ACCOUNT_TRANSFER"
  | "CREDIT_FORBIDDEN"
  | "FORBIDDEN"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  INVALID_ACCOUNT_ID: 400,
  INVALID_TRANSACTION_TYPE: 400,
  INVALID_AMOUNT: 400,
  INVALID_PAGINATION: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  TOO_MANY_ATTEMPTS: 429,
  ACCOUNT_NOT_FOUND: 404,
  ROUTE_NOT_FOUND: 404,
  TRANSACTION_IMMUTABLE: 405,
  USERNAME_TAKEN: 409,
  DUPLICATE_TRANSACTION: 409,
  INSUFFICIENT_BALANCE: 422,
  SAME_ACCOUNT_TRANSFER: 422,
  CREDIT_FORBIDDEN: 403,
  FORBIDDEN: 403,
  INTERNAL_ERROR: 500,
};

export interface FieldError {
  field: string;
  message: string;
}

/** A domain error that maps 1:1 onto the API error envelope. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: FieldError[] | Record<string, unknown>;
  readonly headers?: Record<string, string>;

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      details?: FieldError[] | Record<string, unknown>;
      headers?: Record<string, string>;
    } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = options.details;
    this.headers = options.headers;
  }
}

export const accountNotFound = () =>
  new AppError("ACCOUNT_NOT_FOUND", "Account not found");

export const unauthenticated = (message = "Authentication required") =>
  new AppError("UNAUTHENTICATED", message, {
    headers: { "WWW-Authenticate": 'Bearer realm="ledgerflow"' },
  });
