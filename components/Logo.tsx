import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="logo" aria-label="LedgerFlow home">
      <span className="logo-mark">
        <ArrowLeftRight size={18} strokeWidth={2.6} />
      </span>
      <span>LedgerFlow</span>
    </Link>
  );
}
