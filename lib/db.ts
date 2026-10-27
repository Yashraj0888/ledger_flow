import { AppError, accountNotFound } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase/server";

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

/**
 * Translate database errors (custom SQLSTATEs raised by the SQL functions in
 * supabase/migrations) into API errors. Anything unknown becomes a 500 and is
 * logged server-side only - SQL details are never leaked to clients.
 */
function mapDbError(error: PostgrestLikeError): Error {
  switch (error.code) {
    case "LF001":
      return accountNotFound();
    case "LF002":
      return new AppError(
        "INSUFFICIENT_BALANCE",
        "Insufficient balance for this operation",
      );
    case "LF003":
      return new AppError(
        "SAME_ACCOUNT_TRANSFER",
        "Source and destination accounts must be different",
      );
    case "LF004":
      return new AppError(
        "INVALID_AMOUNT",
        "Amount must be greater than 0 with at most 2 decimal places",
      );
    case "LF005":
      return new AppError(
        "CREDIT_FORBIDDEN",
        "Only an administrator can add money to an account",
      );
    default:
      console.error("[db] unexpected error", error);
      return new Error("Database error");
  }
}

/** Call a SQL function via PostgREST and map its errors. */
export async function rpc<T>(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) throw mapDbError(error);
  return data as T;
}
