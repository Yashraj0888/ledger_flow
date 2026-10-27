import { AppError } from "@/lib/errors";
import { route } from "@/lib/http";

/**
 * Transactions are immutable. These handlers exist only to answer explicitly
 * with 405 TRANSACTION_IMMUTABLE; a DB trigger also blocks UPDATE/DELETE.
 */
const immutable = route(async () => {
  throw new AppError(
    "TRANSACTION_IMMUTABLE",
    "Transactions cannot be modified or deleted",
    { headers: { Allow: "" } },
  );
});

export const PUT = immutable;
export const PATCH = immutable;
export const DELETE = immutable;
