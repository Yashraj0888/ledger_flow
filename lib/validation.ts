import { z } from "zod";
import { AppError } from "@/lib/errors";
import { parseMoney } from "@/lib/money";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AppIssueCode =
  | "INVALID_ACCOUNT_ID"
  | "INVALID_TRANSACTION_TYPE"
  | "INVALID_AMOUNT";

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Field that must be present; when present it is checked by `check`. A failed
 * check is reported with a specific API error code (see fromZodError); a
 * missing field is a plain VALIDATION_ERROR.
 */
function coded<T>(
  field: string,
  code: AppIssueCode,
  check: (value: unknown) => { ok: true; value: T } | { ok: false; message: string },
) {
  return z
    .unknown()
    .optional()
    .transform((value, ctx): T => {
      if (value === undefined) {
        ctx.addIssue({ code: "custom", message: `${field} is required` });
        return z.NEVER;
      }
      const result = check(value);
      if (!result.ok) {
        ctx.addIssue({
          code: "custom",
          message: result.message,
          params: { app_code: code },
        });
        return z.NEVER;
      }
      return result.value;
    });
}

const uuidField = (field: string) =>
  coded<string>(field, "INVALID_ACCOUNT_ID", (v) =>
    isUuid(v)
      ? { ok: true, value: v.toLowerCase() }
      : { ok: false, message: `${field} must be a valid UUID` },
  );

const amountField = coded<string>("amount", "INVALID_AMOUNT", (v) => {
  const result = parseMoney(v);
  return result.ok ? { ok: true, value: result.value } : result;
});

const typeField = coded<"credit" | "debit">(
  "type",
  "INVALID_TRANSACTION_TYPE",
  (v) =>
    v === "credit" || v === "debit"
      ? { ok: true, value: v }
      : { ok: false, message: 'type must be either "credit" or "debit"' },
);

const referenceIdField = z
  .string({ error: "reference_id is required and must be a string" })
  .trim()
  .min(1, "reference_id must not be blank")
  .max(128, "reference_id must be at most 128 characters");

const descriptionField = z
  .string({ error: "description must be a string" })
  .max(500, "description must be at most 500 characters")
  .nullish()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  });

const usernameField = z
  .string({ error: "username is required and must be a string" })
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9_]{3,32}$/,
    "username must be 3-32 characters: letters, digits or underscore",
  );

const mpinField = z
  .string({ error: "mpin is required and must be a string" })
  .regex(/^\d{4,6}$/, "mpin must be 4 to 6 digits");

// ---------------------------------------------------------------- auth

export const registerSchema = z.strictObject({
  username: usernameField,
  password: z
    .string({ error: "password is required and must be a string" })
    .min(8, "password must be at least 8 characters")
    .max(128, "password must be at most 128 characters"),
  mpin: mpinField,
});

export const loginSchema = z.discriminatedUnion(
  "method",
  [
    z.strictObject({
      method: z.literal("password"),
      username: z.string({ error: "username is required" }).trim().toLowerCase().min(1).max(64),
      password: z
        .string({ error: "password is required and must be a string" })
        .min(1, "password is required")
        .max(128),
    }),
    z.strictObject({
      method: z.literal("mpin"),
      username: z.string({ error: "username is required" }).trim().toLowerCase().min(1).max(64),
      mpin: mpinField,
    }),
  ],
  { error: 'method is required and must be "password" or "mpin"' },
);

// ------------------------------------------------------------ ledger

export const createAccountSchema = z.strictObject({
  name: z
    .string({ error: "name is required and must be a string" })
    .trim()
    .min(1, "name must not be blank")
    .max(255, "name must be at most 255 characters"),
});

export const createTransactionSchema = z.strictObject({
  type: typeField,
  amount: amountField,
  description: descriptionField,
  reference_id: referenceIdField,
});

export const adminLoginSchema = z.strictObject({
  username: z
    .string({ error: "username is required" })
    .trim()
    .min(1, "username is required")
    .max(64),
  password: z
    .string({ error: "password is required and must be a string" })
    .min(1, "password is required")
    .max(128),
});

export const adminCreditSchema = z.strictObject({
  amount: amountField,
  description: descriptionField,
  reference_id: referenceIdField,
});

export const createTransferSchema = z.strictObject({
  from_account_id: uuidField("from_account_id"),
  to_account_id: uuidField("to_account_id"),
  amount: amountField,
  description: descriptionField,
  reference_id: referenceIdField,
});

// ------------------------------------------------------ path / query

/** Validate a UUID path parameter -> 400 INVALID_ACCOUNT_ID. */
export function parseAccountId(value: string): string {
  if (!isUuid(value)) {
    throw new AppError("INVALID_ACCOUNT_ID", "accountId must be a valid UUID", {
      details: [{ field: "accountId", message: "accountId must be a valid UUID" }],
    });
  }
  return value.toLowerCase();
}

/** Validate the optional `type` query filter. */
export function parseTypeFilter(value: string | null): "credit" | "debit" | null {
  if (value === null) return null;
  if (value === "credit" || value === "debit") return value;
  throw new AppError(
    "INVALID_TRANSACTION_TYPE",
    'type must be either "credit" or "debit"',
    { details: [{ field: "type", message: 'type must be either "credit" or "debit"' }] },
  );
}
