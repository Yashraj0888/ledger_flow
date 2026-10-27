"use client";

import { useState } from "react";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/Modal";
import { api, ApiError, type Transaction } from "@/lib/client/api";
import {
  CURRENCY_SYMBOL,
  formatMoney,
  newReference,
  normaliseAmount,
  toCents,
  validateAmount,
} from "@/lib/client/format";
import { notifyError } from "@/lib/client/notify";

type Kind = "credit" | "debit";

interface Props {
  open: boolean;
  onClose: () => void;
  accountId: string;
  accountName: string;
  balance: string;
  initialType: Kind;
  onDone: () => void;
}

export function TransactionModal({ open, onClose, accountName, ...rest }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New transaction"
      description={`Record money in or out of “${accountName}”.`}
    >
      <TransactionForm onClose={onClose} accountName={accountName} {...rest} />
    </Modal>
  );
}

type Errors = Partial<Record<"amount" | "reference" | "description", string>>;

function TransactionForm({
  onClose,
  accountId,
  balance,
  initialType,
  onDone,
}: Omit<Props, "open" | "accountName"> & { accountName: string }) {
  const [type, setType] = useState<Kind>(initialType);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState(() => newReference());
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  function validate(): boolean {
    const next: Errors = {};
    const amountError = validateAmount(amount);
    if (amountError) next.amount = amountError;
    else if (type === "debit" && toCents(normaliseAmount(amount)) > toCents(balance)) {
      next.amount = `That's more than your balance of ${formatMoney(balance)}`;
    }
    if (!reference.trim()) next.reference = "A reference is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !validate()) return;
    setBusy(true);
    try {
      const { data } = await api<Transaction & { balance: string }>(`/accounts/${accountId}/transactions`, {
        method: "POST",
        body: {
          type,
          amount: normaliseAmount(amount),
          description: description.trim() || null,
          reference_id: reference.trim(),
        },
      });
      const money = formatMoney(data.amount);
      toast.success(type === "credit" ? `${money} added` : `${money} withdrawn`, {
        description: `New balance ${formatMoney(data.balance)}.`,
      });
      onDone();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "DUPLICATE_TRANSACTION") {
          setErrors({ reference: "This reference was already used on this account" });
        } else if (error.code === "INSUFFICIENT_BALANCE") {
          setErrors({ amount: "Not enough balance for this withdrawal" });
        } else {
          const f = error.fieldErrors;
          setErrors({ amount: f.amount, reference: f.reference_id, description: f.description });
        }
      }
      notifyError(error, "Transaction failed");
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <div className="segmented credit" role="tablist" aria-label="Transaction type">
        <button
          type="button"
          role="tab"
          data-kind="credit"
          aria-selected={type === "credit"}
          onClick={() => setType("credit")}
        >
          <ArrowDownLeft size={16} /> Add money
        </button>
        <button
          type="button"
          role="tab"
          data-kind="debit"
          aria-selected={type === "debit"}
          onClick={() => setType("debit")}
        >
          <ArrowUpRight size={16} /> Withdraw
        </button>
      </div>

      <div className="field">
        <label className="label" htmlFor="tx-amount">
          <span>Amount</span>
          <span className="muted" style={{ fontWeight: 500 }}>
            Balance {formatMoney(balance)}
          </span>
        </label>
        <div className="input-wrap">
          <span className="amount-sym">{CURRENCY_SYMBOL}</span>
          <input
            id="tx-amount"
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
            autoFocus
          />
        </div>
        {errors.amount && (
          <span className="error-text" role="alert">
            <AlertCircle size={14} /> {errors.amount}
          </span>
        )}
      </div>

      <div className="field">
        <label className="label" htmlFor="tx-desc">
          Note <span className="muted" style={{ fontWeight: 500 }}>optional</span>
        </label>
        <input
          id="tx-desc"
          className="input"
          placeholder="What's this for?"
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="tx-ref">
          <span>Reference</span>
          <span className="muted" style={{ fontWeight: 500 }}>unique per account</span>
        </label>
        <div className="input-wrap">
          <input
            id="tx-ref"
            className="input mono has-trail"
            style={{ fontSize: "0.88rem" }}
            maxLength={128}
            value={reference}
            aria-invalid={!!errors.reference}
            onChange={(e) => {
              setReference(e.target.value);
              setErrors((p) => ({ ...p, reference: undefined }));
            }}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon trail"
            style={{ border: 0 }}
            title="Generate a new reference"
            aria-label="Generate a new reference"
            onClick={() => {
              setReference(newReference());
              setErrors((p) => ({ ...p, reference: undefined }));
            }}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        {errors.reference ? (
          <span className="error-text" role="alert">
            <AlertCircle size={14} /> {errors.reference}
          </span>
        ) : (
          <span className="hint">Submitting the same reference twice never double-counts.</span>
        )}
      </div>

      <div className="row gap-3" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className={`btn ${type === "credit" ? "btn-credit" : "btn-debit"}`} disabled={busy}>
          {busy ? (
            <Loader2 size={18} className="spin" />
          ) : type === "credit" ? (
            <ArrowDownLeft size={18} />
          ) : (
            <ArrowUpRight size={18} />
          )}
          {busy ? "Processing…" : type === "credit" ? "Add money" : "Withdraw"}
        </button>
      </div>
    </form>
  );
}
