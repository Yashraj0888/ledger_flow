import { CURRENCY_SYMBOL, splitMoney } from "@/lib/client/format";

/** Exact-decimal money display with a softer fractional part. */
export function Money({ value, className = "" }: { value: string; className?: string }) {
  const { whole, cents } = splitMoney(value);
  return (
    <span className={`money ${className}`}>
      <span className="sym">{CURRENCY_SYMBOL}</span>
      {whole}
      <span className="cents">.{cents}</span>
    </span>
  );
}
