"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowDownUp,
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Money } from "@/components/Money";
import { api, ApiError, fetchAllAccounts, type Account, type TransferResult } from "@/lib/client/api";
import {
  CURRENCY_SYMBOL,
  formatMoney,
  fromCents,
  newReference,
  normaliseAmount,
  toCents,
  validateAmount,
} from "@/lib/client/format";
import { notifyError } from "@/lib/client/notify";

type Errors = Partial<Record<"from" | "to" | "amount" | "reference", string>>;

export function TransferView() {
  const searchParams = useSearchParams();
  const presetFrom = searchParams.get("from");

  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState(() => newReference("xfer"));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TransferResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchAllAccounts(controller.signal)
      .then((list) => {
        setAccounts(list);
        // Default the source to the richest account (or the one the user came from).
        const richest = [...list].sort((a, b) => (toCents(b.balance) > toCents(a.balance) ? 1 : toCents(b.balance) < toCents(a.balance) ? -1 : 0))[0];
        const from = list.find((a) => a.id === presetFrom) ?? richest;
        const to = list.find((a) => a.id !== from?.id);
        setFromId(from?.id ?? "");
        setToId(to?.id ?? "");
      })
      .catch((error) => {
        notifyError(error, "Couldn't load your accounts");
        setAccounts((prev) => prev ?? []);
      });
    return () => controller.abort();
  }, [presetFrom]);

  const from = accounts?.find((a) => a.id === fromId);
  const to = accounts?.find((a) => a.id === toId);

  const preview = useMemo(() => {
    if (!from || !to || validateAmount(amount)) return null;
    const cents = toCents(normaliseAmount(amount));
    return {
      cents,
      fromAfter: fromCents(toCents(from.balance) - cents),
      toAfter: fromCents(toCents(to.balance) + cents),
      overdraws: cents > toCents(from.balance),
    };
  }, [from, to, amount]);

  function pickFrom(id: string) {
    setFromId(id);
    if (id === toId) setToId(accounts?.find((a) => a.id !== id)?.id ?? "");
    setErrors({});
  }

  function swap() {
    setFromId(toId);
    setToId(fromId);
    setErrors({});
  }

  function validate(): boolean {
    const next: Errors = {};
    if (!fromId) next.from = "Choose the source account";
    if (!toId) next.to = "Choose the destination account";
    if (fromId && fromId === toId) next.to = "Pick two different accounts";
    const amountError = validateAmount(amount);
    if (amountError) next.amount = amountError;
    else if (from && toCents(normaliseAmount(amount)) > toCents(from.balance)) {
      next.amount = `That's more than ${from.name}'s balance of ${formatMoney(from.balance)}`;
    }
    if (!reference.trim()) next.reference = "A reference is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !validate() || !from || !to) return;
    setBusy(true);
    try {
      const { data } = await api<TransferResult>("/transfers", {
        method: "POST",
        body: {
          from_account_id: fromId,
          to_account_id: toId,
          amount: normaliseAmount(amount),
          description: description.trim() || null,
          reference_id: reference.trim(),
        },
      });
      toast.success(`${formatMoney(data.amount)} transferred`, {
        description: `${from.name} → ${to.name}. Both balances are updated.`,
      });
      setResult(data);
      setAccounts((prev) =>
        prev?.map((a) =>
          a.id === data.from_account_id
            ? { ...a, balance: data.from_balance }
            : a.id === data.to_account_id
              ? { ...a, balance: data.to_balance }
              : a,
        ) ?? prev,
      );
      setAmount("");
      setDescription("");
      setReference(newReference("xfer"));
      setErrors({});
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "DUPLICATE_TRANSACTION") {
          setErrors({ reference: "This reference was already used on the source account" });
        } else if (error.code === "INSUFFICIENT_BALANCE") {
          setErrors({ amount: "Not enough balance in the source account" });
        } else {
          const f = error.fieldErrors;
          setErrors({
            amount: f.amount,
            reference: f.reference_id,
            from: f.from_account_id,
            to: f.to_account_id,
          });
        }
      }
      notifyError(error, "Transfer failed");
    } finally {
      setBusy(false);
    }
  }

  if (accounts === null) {
    return <div className="skeleton" style={{ height: 420, borderRadius: 18 }} />;
  }

  if (accounts.length < 2) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Transfer</h1>
            <p>Move money between your own accounts.</p>
          </div>
        </div>
        <div className="card empty">
          <div className="art">
            <Landmark size={32} />
          </div>
          <h3>{accounts.length === 0 ? "You have no accounts yet" : "You need a second account"}</h3>
          <p>Transfers move money between two of your accounts. Open another one to get started.</p>
          <Link href="/dashboard" className="btn btn-primary" style={{ marginTop: 8 }}>
            <Plus size={18} /> Go to accounts
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Transfer</h1>
          <p>Move money between your own accounts, instantly and atomically.</p>
        </div>
      </div>

      <div className="transfer-grid">
        <form className="card card-pad form" onSubmit={onSubmit} noValidate>
          <div className="field">
            <label className="label" htmlFor="from">
              <span>From</span>
              {from && <span className="muted" style={{ fontWeight: 500 }}>Balance {formatMoney(from.balance)}</span>}
            </label>
            <select id="from" className="input" value={fromId} aria-invalid={!!errors.from} onChange={(e) => pickFrom(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {formatMoney(a.balance)}
                </option>
              ))}
            </select>
            {errors.from && <span className="error-text" role="alert"><AlertCircle size={14} /> {errors.from}</span>}
          </div>

          <div className="row" style={{ justifyContent: "center", margin: "-6px 0" }}>
            <button type="button" className="btn btn-ghost btn-icon swap" onClick={swap} aria-label="Swap accounts" title="Swap accounts">
              <ArrowDownUp size={18} />
            </button>
          </div>

          <div className="field">
            <label className="label" htmlFor="to">
              <span>To</span>
              {to && <span className="muted" style={{ fontWeight: 500 }}>Balance {formatMoney(to.balance)}</span>}
            </label>
            <select id="to" className="input" value={toId} aria-invalid={!!errors.to} onChange={(e) => { setToId(e.target.value); setErrors((p) => ({ ...p, to: undefined })); }}>
              {accounts.filter((a) => a.id !== fromId).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {formatMoney(a.balance)}
                </option>
              ))}
            </select>
            {errors.to && <span className="error-text" role="alert"><AlertCircle size={14} /> {errors.to}</span>}
          </div>

          <div className="field">
            <label className="label" htmlFor="amount">Amount</label>
            <div className="input-wrap">
              <span className="amount-sym">{CURRENCY_SYMBOL}</span>
              <input
                id="amount"
                className="input amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={amount}
                aria-invalid={!!errors.amount}
                onChange={(e) => {
                  setAmount(e.target.value.replace(/[^\d.]/g, ""));
                  setErrors((p) => ({ ...p, amount: undefined }));
                }}
              />
            </div>
            {errors.amount && <span className="error-text" role="alert"><AlertCircle size={14} /> {errors.amount}</span>}
          </div>

          <div className="field">
            <label className="label" htmlFor="note">Note <span className="muted" style={{ fontWeight: 500 }}>optional</span></label>
            <input id="note" className="input" placeholder="e.g. Rent share" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="field">
            <label className="label" htmlFor="ref">
              <span>Reference</span>
              <span className="muted" style={{ fontWeight: 500 }}>unique per source account</span>
            </label>
            <div className="input-wrap">
              <input
                id="ref"
                className="input mono has-trail"
                style={{ fontSize: "0.88rem" }}
                maxLength={128}
                value={reference}
                aria-invalid={!!errors.reference}
                onChange={(e) => { setReference(e.target.value); setErrors((p) => ({ ...p, reference: undefined })); }}
              />
              <button type="button" className="btn btn-ghost btn-sm btn-icon trail" style={{ border: 0 }} title="Generate a new reference" aria-label="Generate a new reference" onClick={() => setReference(newReference("xfer"))}>
                <RefreshCw size={16} />
              </button>
            </div>
            {errors.reference && <span className="error-text" role="alert"><AlertCircle size={14} /> {errors.reference}</span>}
          </div>

          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
            {busy ? "Transferring…" : "Transfer now"}
          </button>
        </form>

        <aside className="stack gap-4">
          <div className="card card-pad">
            <h2 className="row gap-2" style={{ marginBottom: 6 }}>
              <ArrowLeftRight size={18} /> Summary
            </h2>
            <p className="muted" style={{ fontSize: "0.88rem", marginBottom: 8 }}>
              {preview ? "Balances after this transfer" : "Enter an amount to preview the result."}
            </p>
            {from && to && (
              <>
                <div className="preview-row">
                  <div>
                    <div style={{ fontWeight: 600 }}>{from.name}</div>
                    <div className="muted" style={{ fontSize: "0.82rem" }}>{formatMoney(from.balance)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {preview ? (
                      <>
                        <div className="delta down">−{formatMoney(fromCents(preview.cents))}</div>
                        <div style={{ fontWeight: 600, color: preview.overdraws ? "var(--debit)" : undefined }}>
                          {formatMoney(preview.fromAfter)}
                        </div>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </div>
                </div>
                <div className="preview-row">
                  <div>
                    <div style={{ fontWeight: 600 }}>{to.name}</div>
                    <div className="muted" style={{ fontSize: "0.82rem" }}>{formatMoney(to.balance)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {preview ? (
                      <>
                        <div className="delta up">+{formatMoney(fromCents(preview.cents))}</div>
                        <div style={{ fontWeight: 600 }}>{formatMoney(preview.toAfter)}</div>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {result && (
            <div className="card card-pad success-card stack gap-4" role="status">
              <div className="row gap-3">
                <span className="check-ring"><CheckCircle2 size={28} /></span>
                <div>
                  <h3>Transfer complete</h3>
                  <div className="muted" style={{ fontSize: "0.86rem" }}>
                    <Money value={result.amount} /> moved successfully
                  </div>
                </div>
              </div>
              <div className="row gap-3 wrap">
                <Link href={`/accounts/${result.from_account_id}`} className="btn btn-sm">
                  View source <ArrowRight size={15} />
                </Link>
                <Link href={`/accounts/${result.to_account_id}`} className="btn btn-sm">
                  View destination <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
