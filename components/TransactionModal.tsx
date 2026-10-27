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

type TxType = "credit" | "debit";

interface Props {
  open: boolean;
  onClose: () => void;
  type: TxType;
  accountId: string;
  accountName: string;
  balance: string;
  onDone: () => void;
}

type Errors = Partial<Record<"amount" | "reference", string>>;

export function TransactionModal({ open, onClose, accountName, type, ...rest }: Props) {
  const isCredit = type === "credit";
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isCredit ? "Add money" : "Withdraw"}
      description={
        isCredit
          ? `Credit “${accountName}”.`
          : `Take money out of “${accountName}”.`
      }
    >
      <TransactionForm onClose={onClose} type={type} {...rest} />
    </Modal>
  );
}

function TransactionForm({
  onClose,
  accountId,
  balance,
  type,
  onDone,
}: Omit<Props, "open" | "accountName">) {
  const isCredit = type === "credit";
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState(() => newReference(isCredit ? "cr" : "wd"));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  function validate(): boolean {
    const next: Errors = {};
    const amountError = validateAmount(amount);
    if (amountError) next.amount = amountError;
    else if (!isCredit && toCents(normaliseAmount(amount)) > toCents(balance)) {
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
      toast.success(
        isCredit
          ? `${formatMoney(data.amount)} added`
          : `${formatMoney(data.amount)} withdrawn`,
        { description: `New balance ${formatMoney(data.balance)}.` },
      );
      onDone();
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.code === "DUPLICATE_TRANSACTION") {
        setErrors({ reference: "This reference was already used on this account" });
      }
      notifyError(error, isCredit ? "Couldn't add money" : "Couldn't withdraw");
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
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
            placeholder="0.00"
            value={amount}
            aria-invalid={!!errors.amount}
            autoFocus
            onChange={(e) => {
              setAmount(e.target.value);
              setErrors((p) => ({ ...p, amount: undefined }));
            }}
          />
        </div>
        {errors.amount && (
          <span className="error-text" role="alert">
            <AlertCircle size={14} /> {errors.amount}
          </span>
        )}
      </div>

      <div className="field">
        <label className="label" htmlFor="tx-note">
          Note <span className="muted" style={{ fontWeight: 500 }}>optional</span>
        </label>
        <input
          id="tx-note"
          className="input"
          placeholder="What's this for?"
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="tx-ref">
          Reference <span className="muted" style={{ fontWeight: 500 }}>unique per account</span>
        </label>
        <div className="input-wrap">
          <input
            id="tx-ref"
            className="input has-trail mono"
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
            aria-label="Generate a new reference"
            onClick={() => setReference(newReference(isCredit ? "cr" : "wd"))}
          >
            <RefreshCw size={15} />
          </button>
        </div>
        {errors.reference && (
          <span className="error-text" role="alert">
            <AlertCircle size={14} /> {errors.reference}
          </span>
        )}
      </div>

      <div className="row gap-3" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-ghost grow" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="submit"
          className={`btn grow ${isCredit ? "btn-credit" : "btn-debit"}`}
          disabled={busy}
        >
          {busy ? (
            <Loader2 size={18} className="spin" />
          ) : isCredit ? (
            <ArrowDownLeft size={18} />
          ) : (
            <ArrowUpRight size={18} />
          )}
          {busy ? "Processing…" : isCredit ? "Add money" : "Withdraw"}
        </button>
      </div>
    </form>
  );
}
