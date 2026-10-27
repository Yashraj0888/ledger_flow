"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  Landmark,
  Receipt,
  SearchX,
} from "lucide-react";
import { toast } from "sonner";
import { Money } from "@/components/Money";
import { WithdrawModal } from "@/components/WithdrawModal";
import { api, ApiError, type Account, type Pagination, type Transaction } from "@/lib/client/api";
import { cardColorFor, formatDate, formatDateTime, formatMoney } from "@/lib/client/format";
import { notifyError } from "@/lib/client/notify";

type Filter = "all" | "credit" | "debit";

export function AccountSkeleton() {
  return (
    <>
      <div className="skeleton" style={{ height: 18, width: 120, marginBottom: 18 }} />
      <div className="skeleton" style={{ height: 210, borderRadius: 24, marginBottom: 24 }} />
      <div className="skeleton" style={{ height: 320, borderRadius: 18 }} />
    </>
  );
}

export function AccountView() {
  const { accountId } = useParams<{ accountId: string }>();
  // Re-mount per account so state from a previous account can never leak in.
  return <AccountContent key={accountId} accountId={accountId} />;
}

function AccountContent({ accountId }: { accountId: string }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [missing, setMissing] = useState(false);
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false; // set when a newer request supersedes this one
    const query = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filter !== "all") query.set("type", filter);

    Promise.all([
      api<Account>(`/accounts/${accountId}`),
      api<Transaction[]>(`/accounts/${accountId}/transactions?${query}`),
    ])
      .then(([acc, history]) => {
        if (cancelled) return;
        setAccount(acc.data);
        setItems(history.data);
        setPagination(history.pagination ?? null);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && (error.code === "ACCOUNT_NOT_FOUND" || error.code === "INVALID_ACCOUNT_ID")) {
          setMissing(true);
          return;
        }
        notifyError(error, "Couldn't load this account");
        setItems((prev) => prev ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, filter, page, limit, reloadKey]);

  if (missing) {
    return (
      <div className="card empty">
        <div className="art">
          <SearchX size={32} />
        </div>
        <h3>Account not found</h3>
        <p>This account doesn&apos;t exist, or it isn&apos;t yours.</p>
        <Link href="/dashboard" className="btn btn-primary" style={{ marginTop: 8 }}>
          <ArrowLeft size={18} /> Back to dashboard
        </Link>
      </div>
    );
  }

  if (!account) return <AccountSkeleton />;

  return (
    <>
      <Link href="/dashboard" className="back-link">
        <ArrowLeft size={16} /> All accounts
      </Link>

      <section
        className="balance-hero"
        style={{ "--card-color": cardColorFor(account.id) } as React.CSSProperties}
        aria-label="Account balance"
      >
        <div className="row between wrap gap-3">
          <div className="row gap-3">
            <span className="chip" style={{ width: 38, height: 28, borderRadius: 7, background: "rgba(255,250,241,0.38)" }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: "1.1rem" }}>{account.name}</div>
              <div style={{ fontSize: "0.8rem", opacity: 0.8 }}>Opened {formatDate(account.created_at)}</div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-glass btn-sm"
            onClick={() => {
              navigator.clipboard
                .writeText(account.id)
                .then(() => toast.success("Account ID copied", { description: account.id }))
                .catch(() => toast.error("Couldn't copy", { description: "Copy it manually from the page." }));
            }}
            title="Copy account ID"
          >
            <Copy size={15} /> <span className="mono">•••• {account.id.slice(-4)}</span>
          </button>
        </div>
        <div style={{ fontSize: "0.85rem", opacity: 0.85, marginTop: 22 }}>Available balance</div>
        <div className="big">
          <Money value={account.balance} />
        </div>
        <div className="row gap-3 wrap">
          <Link href={`/transfer?from=${account.id}`} className="btn btn-cream">
            <ArrowLeftRight size={18} /> Transfer
          </Link>
          <button className="btn btn-glass" onClick={() => setWithdrawOpen(true)}>
            <ArrowUpRight size={18} /> Withdraw
          </button>
        </div>
      </section>

      <section className="card" style={{ marginTop: 24, overflow: "hidden" }} aria-label="Transaction history">
        <div className="card-head">
          <h2 className="row gap-2">
            <Receipt size={19} /> Activity
          </h2>
          <div className="segmented" role="tablist" aria-label="Filter transactions" style={{ minWidth: 260 }}>
            {(["all", "credit", "debit"] as Filter[]).map((value) => (
              <button
                key={value}
                role="tab"
                type="button"
                aria-selected={filter === value}
                onClick={() => {
                  setFilter(value);
                  setPage(1);
                }}
              >
                {value === "all" ? "All" : value === "credit" ? "Money in" : "Money out"}
              </button>
            ))}
          </div>
        </div>

        {items === null ? (
          <div style={{ padding: 22 }} className="stack gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 52 }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="empty">
            <div className="art">
              <Landmark size={30} />
            </div>
            <h3>{filter === "all" ? "No activity yet" : "Nothing here"}</h3>
            <p>
              {filter === "all"
                ? "Money arrives when an admin credits this account, or when someone transfers to you."
                : "No transactions match this filter."}
            </p>
            {filter === "all" && (
              <Link href={`/transfer?from=${account.id}`} className="btn btn-primary" style={{ marginTop: 8 }}>
                <ArrowLeftRight size={18} /> Transfer
              </Link>
            )}
          </div>
        ) : (
          <div>
            {items.map((tx, index) => (
              <div className="tx" key={tx.id} style={{ animationDelay: `${index * 30}ms` }}>
                <span className={`ico ${tx.type}`}>
                  {tx.type === "credit" ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="title">
                    {tx.description || (tx.type === "credit" ? "Money added" : "Money withdrawn")}
                  </div>
                  <div className="sub">
                    <span className="mono" title="Reference">
                      {tx.reference_id}
                    </span>
                    {tx.transfer_id && (
                      <span className="badge accent">
                        <ArrowLeftRight size={11} /> Transfer
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className={`amt ${tx.type}`}>
                    {formatMoney(tx.amount, { sign: tx.type === "credit" ? "+" : "-" })}
                  </div>
                  <div className="when" style={{ textAlign: "right" }}>
                    {formatDateTime(tx.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {pagination && pagination.total_records > 0 && (
          <div className="pager">
            <span>
              {pagination.total_records} transaction{pagination.total_records === 1 ? "" : "s"} · Page{" "}
              {pagination.current_page} of {pagination.total_pages}
            </span>
            <div className="row gap-3">
              <select
                className="input"
                style={{ height: 34, width: 124, fontSize: "0.85rem", borderRadius: 10, paddingLeft: 12, paddingRight: 32, backgroundPosition: "right 10px center" }}
                aria-label="Rows per page"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
              >
                {[10, 20, 50].map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
              <button
                className="btn btn-sm btn-icon"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                className="btn btn-sm btn-icon"
                aria-label="Next page"
                disabled={page >= pagination.total_pages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        )}
      </section>

      <WithdrawModal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        accountId={account.id}
        accountName={account.name}
        balance={account.balance}
        onDone={() => {
          setFilter("all");
          setPage(1);
          setReloadKey((k) => k + 1);
        }}
      />
    </>
  );
}
