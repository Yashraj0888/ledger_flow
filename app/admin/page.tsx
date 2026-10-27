"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowDownLeft,
  Landmark,
  Loader2,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Money } from "@/components/Money";
import { Modal } from "@/components/Modal";
import { api, ApiError, type AdminAccount, type Transaction } from "@/lib/client/api";
import {
  CURRENCY_SYMBOL,
  formatDate,
  formatMoney,
  newReference,
  normaliseAmount,
  validateAmount,
} from "@/lib/client/format";
import { notifyError } from "@/lib/client/notify";

const PAGE_SIZE = 50;

export default function AdminPage() {
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<AdminAccount | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const all: AdminAccount[] = [];
        let page = 1;
        let totalRecords = 0;
        for (;;) {
          const { data, pagination } = await api<AdminAccount[]>(
            `/admin/accounts?page=${page}&limit=${PAGE_SIZE}`,
            { signal: controller.signal, skipAuthRedirect: true },
          );
          all.push(...data);
          totalRecords = pagination?.total_records ?? all.length;
          if (!pagination || page >= pagination.total_pages || page >= 40) break;
          page += 1;
        }
        if (!cancelled) {
          setAccounts(all);
          setTotal(totalRecords);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notifyError(error, "Couldn't load accounts");
        if (!cancelled) setAccounts((prev) => prev ?? []);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reloadKey]);

  const filtered =
    accounts?.filter((a) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.owner_username.toLowerCase().includes(q) ||
        a.owner_name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
      );
    }) ?? null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Credit accounts</h1>
          <p>Add money to any user&apos;s account. You cannot withdraw or transfer.</p>
        </div>
        <button className="btn" type="button" onClick={() => setReloadKey((k) => k + 1)}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="stats" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="card stat">
          <div className="k">
            <Landmark size={16} /> Accounts
          </div>
          <div className="v">{accounts ? total : <div className="skeleton" style={{ height: 40, width: 60 }} />}</div>
        </div>
        <div className="card stat">
          <div className="k">
            <Wallet size={16} /> Showing
          </div>
          <div className="v">
            {filtered ? filtered.length : <div className="skeleton" style={{ height: 40, width: 60 }} />}
          </div>
        </div>
      </div>

      <div className="field" style={{ marginBottom: 16, maxWidth: 420 }}>
        <div className="input-wrap">
          <Search size={18} className="lead" />
          <input
            className="input has-lead"
            placeholder="Search by name, username, account or ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        {filtered === null ? (
          <div style={{ padding: 22 }} className="stack gap-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton" style={{ height: 56 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="art">
              <Landmark size={30} />
            </div>
            <h3>No accounts match</h3>
            <p>Try a different search, or wait for users to open accounts.</p>
          </div>
        ) : (
          <div>
            {filtered.map((account) => (
              <div key={account.id} className="tx">
                <span className="ico credit">
                  <Landmark size={18} />
                </span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="title">
                    {account.name}{" "}
                    <span className="muted" style={{ fontWeight: 500 }}>
                      · {account.owner_name} (@{account.owner_username})
                    </span>
                  </div>
                  <div className="sub">
                    <span className="mono">•••• {account.id.slice(-8)}</span>
                    <span>Opened {formatDate(account.created_at)}</span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }} className="stack gap-2">
                  <div className="amt" style={{ color: "var(--text)" }}>
                    <Money value={account.balance} />
                  </div>
                  <button className="btn btn-sm btn-credit" type="button" onClick={() => setSelected(account)}>
                    <ArrowDownLeft size={15} /> Add money
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <CreditModal
          account={selected}
          onClose={() => setSelected(null)}
          onDone={(balance) => {
            setAccounts(
              (prev) =>
                prev?.map((a) => (a.id === selected.id ? { ...a, balance } : a)) ?? prev,
            );
            setSelected(null);
          }}
        />
      )}
    </>
  );
}

function CreditModal({
  account,
  onClose,
  onDone,
}: {
  account: AdminAccount;
  onClose: () => void;
  onDone: (balance: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("Admin credit");
  const [reference, setReference] = useState(() => newReference("admin"));
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const amountError = validateAmount(amount);
    if (amountError) {
      setError(amountError);
      return;
    }
    if (!reference.trim()) {
      setError("A reference is required");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api<Transaction & { balance: string }>(
        `/admin/accounts/${account.id}/credit`,
        {
          method: "POST",
          body: {
            amount: normaliseAmount(amount),
            description: description.trim() || null,
            reference_id: reference.trim(),
          },
          skipAuthRedirect: true,
        },
      );
      toast.success(`${formatMoney(data.amount)} credited`, {
        description: `${account.name} · ${account.owner_name} → ${formatMoney(data.balance)}`,
      });
      onDone(data.balance);
    } catch (err) {
      if (err instanceof ApiError && err.code === "DUPLICATE_TRANSACTION") {
        setError("This reference was already used on this account");
      }
      notifyError(err, "Couldn't credit the account");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add money"
      description={`Credit “${account.name}” owned by ${account.owner_name}.`}
    >
      <form className="form" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label className="label" htmlFor="admin-amount">
            <span>Amount</span>
            <span className="muted" style={{ fontWeight: 500 }}>
              Current {formatMoney(account.balance)}
            </span>
          </label>
          <div className="input-wrap">
            <span className="amount-sym">{CURRENCY_SYMBOL}</span>
            <input
              id="admin-amount"
              className="input amount"
              inputMode="decimal"
              placeholder="0.00"
              autoFocus
              value={amount}
              aria-invalid={!!error}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(undefined);
              }}
            />
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="admin-note">
            Note
          </label>
          <input
            id="admin-note"
            className="input"
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="admin-ref">
            Reference
          </label>
          <div className="input-wrap">
            <input
              id="admin-ref"
              className="input has-trail mono"
              value={reference}
              onChange={(e) => {
                setReference(e.target.value);
                setError(undefined);
              }}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon trail"
              aria-label="Generate a new reference"
              onClick={() => setReference(newReference("admin"))}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {error && (
          <span className="error-text" role="alert">
            <AlertCircle size={14} /> {error}
          </span>
        )}

        <div className="row gap-3" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-ghost grow" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-credit grow" disabled={busy}>
            {busy ? <Loader2 size={18} className="spin" /> : <ArrowDownLeft size={18} />}
            {busy ? "Crediting…" : "Credit account"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
