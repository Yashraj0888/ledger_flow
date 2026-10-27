const MAX_INTEGER_DIGITS = 16; // NUMERIC(18,2)

export type MoneyResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

/**
 * Parse a client-supplied amount (number or numeric string) into a canonical
 * 2-decimal string such as "50.00". Floats are never used for arithmetic -
 * the database does all math on NUMERIC.
 */
export function parseMoney(input: unknown): MoneyResult {
  let raw: string;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      return { ok: false, message: "Amount must be a valid number" };
    }
    raw = String(input);
  } else if (typeof input === "string") {
    raw = input.trim();
  } else {
    return { ok: false, message: "Amount must be a number or numeric string" };
  }

  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) {
    return { ok: false, message: "Amount must be a valid decimal number" };
  }

  const [, negative, intPart, fracPart = ""] = match;
  if (fracPart.length > 2) {
    return { ok: false, message: "Amount can have at most 2 decimal places" };
  }

  const integer = intPart.replace(/^0+(?=\d)/, "");
  if (integer.length > MAX_INTEGER_DIGITS) {
    return { ok: false, message: "Amount is too large" };
  }

  const value = `${integer}.${fracPart.padEnd(2, "0")}`;
  if (negative || /^0+\.00$/.test(value)) {
    return { ok: false, message: "Amount must be greater than 0" };
  }
  return { ok: true, value };
}
