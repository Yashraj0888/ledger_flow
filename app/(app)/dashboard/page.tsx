"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, ArrowRight, Landmark, Plus, TrendingUp, Wallet } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Money } from "@/components/Money";
import { NewAccountModal } from "@/components/NewAccountModal";
import { fetchAllAccounts, type Account } from "@/lib/client/api";
import { cardColorFor, formatDate, greeting, sumMoney, toCents } from "@/lib/client/format";
import { notifyError } from "@/lib/client/notify";

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [modal, setModal] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchAllAccounts(controller.signal)
      .then(setAccounts)
      .catch((error) => {
        if (controller.signal.aborted) return;
        notifyError(error, "Couldn't load your accounts");
        setAccounts((prev) => prev ?? []);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const total = accounts ? sumMoney(accounts.map((a) => a.balance)) : "0.00";
  const richest = accounts?.reduce<Account | null>(
    (best, a) => (!best || toCents(a.balance) > toCents(best.balance) ? a : best),
    null,
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {greeting()}, <span className="accent-text">{user?.username}</span>
          </h1>
          <p>Here&apos;s everything across your accounts.</p>
        </div>
        <div className="row gap-3">
          <Link href="/transfer" className="btn">
            <ArrowLeftRight size={18} /> Transfer
          </Link>
          <button className="btn btn-primary" onClick={() => setModal(true)}>
            <Plus size={18} /> New account
          </button>
        </div>
      </div>

      <section className="stats" aria-label="Summary">
        <div className="card stat stat-hero">
          <div className="k">
            <Wallet size={16} /> Total balance
          </div>
          <div className="v">{accounts ? <Money value={total} /> : <div className="skeleton" style={{ height: 40, width: 200 }} />}</div>
        </div>
        <div className="card stat">
          <div className="k">
            <Landmark size={16} /> Accounts
          </div>
          <div className="v">{accounts ? accounts.length : <div className="skeleton" style={{ height: 40, width: 60 }} />}</div>
        </div>
        <div className="card stat">
          <div className="k">
            <TrendingUp size={16} /> Largest account
          </div>
          <div className="v" style={{ fontSize: "1.5rem" }}>
            {accounts ? (
              richest ? (
                <>
                  <Money value={richest.balance} />
                  <div className="muted" style={{ fontSize: "0.82rem", fontWeight: 500, marginTop: 4 }}>
                    {richest.name}
                  </div>
                </>
              ) : (
                <span className="muted">—</span>
              )
            ) : (
              <div className="skeleton" style={{ height: 32, width: 120 }} />
            )}
          </div>
        </div>
      </section>

      <div className="row between" style={{ marginBottom: 16 }}>
        <h2>Your accounts</h2>
      </div>

      {accounts === null ? (
        <div className="grid-accounts">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 176, borderRadius: 18 }} />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="card empty">
          <div className="art">
            <Landmark size={32} />
          </div>
          <h3>Open your first account</h3>
          <p>Create an account to start adding money, tracking activity and moving funds.</p>
          <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => setModal(true)}>
            <Plus size={18} /> Create account
          </button>
        </div>
      ) : (
        <div className="grid-accounts">
          {accounts.map((account) => (
            <Link
              key={account.id}
              href={`/accounts/${account.id}`}
              className="account-card"
              style={{ "--card-color": cardColorFor(account.id) } as React.CSSProperties}
            >
              <div className="name">
                <span>{account.name}</span>
                <span className="chip" aria-hidden />
              </div>
              <div>
                <div className="bal">
                  <Money value={account.balance} />
                </div>
                <div className="row between meta" style={{ marginTop: 6 }}>
                  <span>Opened {formatDate(account.created_at)}</span>
                  <span className="row gap-2">
                    <span className="mono">•••• {account.id.slice(-4)}</span>
                    <ArrowRight size={14} />
                  </span>
                </div>
              </div>
            </Link>
          ))}
          <button className="new-card" onClick={() => setModal(true)}>
            <span className="plus">
              <Plus size={22} />
            </span>
            New account
          </button>
        </div>
      )}

      <NewAccountModal
        open={modal}
        onClose={() => setModal(false)}
        onCreated={(account) => {
          setReloadKey((k) => k + 1);
          router.prefetch(`/accounts/${account.id}`);
        }}
      />
    </>
  );
}
