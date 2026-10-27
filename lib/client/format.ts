/** Currency symbol shown in the UI. The API itself is currency-agnostic. */
export const CURRENCY_SYMBOL = "₹";

// Money is handled as integer minor units (BigInt) - never as floats.
export function toCents(value: string): bigint {
  const [int, frac = ""] = value.split(".");
  const negative = int.startsWith("-");
  const digits = int.replace("-", "") + frac.padEnd(2, "0").slice(0, 2);
  const cents = BigInt(digits || "0");
  return negative ? -cents : cents;
}

export function fromCents(cents: bigint): string {
  const negative = cents < BigInt(0);
  const abs = (negative ? -cents : cents).toString().padStart(3, "0");
  return `${negative ? "-" : ""}${abs.slice(0, -2)}.${abs.slice(-2)}`;
}

export function sumMoney(values: string[]): string {
  return fromCents(values.reduce((acc, v) => acc + toCents(v), BigInt(0)));
}

/** Indian digit grouping (12,34,567) on the exact decimal string. */
function group(int: string): string {
  if (int.length <= 3) return int;
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

export function formatMoney(
  value: string,
  { symbol = true, sign = false }: { symbol?: boolean; sign?: "+" | "-" | false } = {},
): string {
  const negative = value.startsWith("-");
  const [int, frac = "00"] = value.replace("-", "").split(".");
  const body = `${group(int)}.${frac.padEnd(2, "0").slice(0, 2)}`;
  const prefix = sign || (negative ? "-" : "");
  return `${prefix}${symbol ? CURRENCY_SYMBOL : ""}${body}`;
}

/** Split into whole and fractional part for big-balance styling. */
export function splitMoney(value: string): { whole: string; cents: string } {
  const formatted = formatMoney(value, { symbol: false });
  const [whole, cents] = formatted.split(".");
  return { whole, cents };
}

const dateTime = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDate = (iso: string) => dateOnly.format(new Date(iso));

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Unique-per-account reference for UI-created transactions. */
export function newReference(prefix = "web"): string {
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

/** Max digits before the decimal — matches DB NUMERIC(18,2) / server parseMoney. */
const MAX_INTEGER_DIGITS = 16;

/**
 * Mirrors server `parseMoney` for instant feedback; the server remains the authority.
 * Messages are specific so "too large" is never mistaken for a format tip.
 */
export function validateAmount(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "Enter an amount";

  if (/^-/.test(value)) return "Amount must be greater than 0";

  // Digits with an optional fractional part (reject letters, exponents, commas, etc.).
  const match = /^(\d+)(?:\.(\d*))?$/.exec(value);
  if (!match) return "Use digits with up to 2 decimals, e.g. 250.50";

  const [, intPart, fracPart] = match;
  if (fracPart !== undefined && fracPart.length === 0) {
    return "Use digits with up to 2 decimals, e.g. 250.50";
  }
  if (fracPart !== undefined && fracPart.length > 2) {
    return "Amount can have at most 2 decimal places";
  }

  const integer = intPart.replace(/^0+(?=\d)/, "");
  if (integer.length > MAX_INTEGER_DIGITS) return "Amount is too large";
  if (/^0+(\.0*)?$/.test(value)) return "Amount must be greater than 0";
  return null;
}

/** Normalise "50" / "50.5" to "50.00" for sending. */
export function normaliseAmount(raw: string): string {
  const [int, frac = ""] = raw.trim().split(".");
  return `${int.replace(/^0+(?=\d)/, "")}.${frac.padEnd(2, "0")}`;
}

/**
 * Deterministic warm colour per account so every card has its own identity.
 * All tones are dark enough for cream text (terracotta, olive, ochre, rose-brick, walnut, moss).
 */
const CARD_COLORS = ["#b4532a", "#5f7340", "#a1701a", "#9a4745", "#6b4a33", "#4f6b4a"];

export function cardColorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return CARD_COLORS[hash % CARD_COLORS.length];
}
