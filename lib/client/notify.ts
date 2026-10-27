import { toast } from "sonner";
import { ApiError } from "@/lib/client/api";

const TITLES: Record<string, { title: string; hint?: string }> = {
  INSUFFICIENT_BALANCE: {
    title: "Insufficient balance",
    hint: "Your balance is unchanged. Try a smaller amount.",
  },
  DUPLICATE_TRANSACTION: {
    title: "Already recorded",
    hint: "This reference was used before, so nothing was changed.",
  },
  INVALID_CREDENTIALS: {
    title: "Couldn't sign you in",
    hint: "Check your username and password or MPIN.",
  },
  TOO_MANY_ATTEMPTS: {
    title: "Too many attempts",
    hint: "For your safety this user is locked for a few minutes.",
  },
  USERNAME_TAKEN: { title: "Username taken", hint: "Pick a different username." },
  ACCOUNT_NOT_FOUND: { title: "Account not found" },
  SAME_ACCOUNT_TRANSFER: { title: "Pick two different accounts" },
  INVALID_AMOUNT: { title: "Invalid amount" },
  VALIDATION_ERROR: { title: "Please check the form" },
  NETWORK_ERROR: { title: "You're offline", hint: "Check your connection and retry." },
  UNAUTHENTICATED: { title: "Session expired", hint: "Please sign in again." },
};

/** Show a friendly error toast for any thrown value. */
export function notifyError(error: unknown, fallbackTitle = "Something went wrong") {
  if (error instanceof DOMException && error.name === "AbortError") return;
  if (error instanceof ApiError) {
    const known = TITLES[error.code];
    const retry =
      error.details && typeof error.details === "object" && "retry_after_seconds" in error.details
        ? Number((error.details as { retry_after_seconds: number }).retry_after_seconds)
        : null;
    const description =
      error.code === "TOO_MANY_ATTEMPTS" && retry
        ? `Try again in about ${Math.ceil(retry / 60)} minute${retry > 60 ? "s" : ""}.`
        : error.code === "VALIDATION_ERROR" || error.code === "INVALID_AMOUNT"
          ? error.message
          : (known?.hint ?? error.message);
    toast.error(known?.title ?? fallbackTitle, { description });
    return;
  }
  toast.error(fallbackTitle, { description: "Please try again in a moment." });
}
