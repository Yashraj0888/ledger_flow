"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, Copy, Landmark, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/Modal";
import { api, ApiError, type Account } from "@/lib/client/api";
import { formatMoney } from "@/lib/client/format";
import { notifyError } from "@/lib/client/notify";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (account: Account) => void;
}

export function NewAccountModal({ open, onClose, onCreated }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Open a new account"
      description="It starts at zero. You'll get an account ID right away — add money, or share the ID for transfers."
    >
      <NewAccountForm onClose={onClose} onCreated={onCreated} />
    </Modal>
  );
}

function NewAccountForm({ onClose, onCreated }: Omit<Props, "open">) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Account | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give your account a name");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api<Account>("/accounts", { method: "POST", body: { name: trimmed } });
      setCreated(data);
      onCreated(data);
      toast.success("Account created", {
        description: `Balance ${formatMoney(data.balance)}. Copy the account ID to receive money.`,
      });
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.name) setError(err.fieldErrors.name);
      notifyError(err, "Couldn't create the account");
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="form">
        <div
          className="card"
          style={{
            padding: 16,
            background: "var(--surface-2, #f3ebe0)",
            border: "1px solid var(--border, #e4d6c5)",
          }}
        >
          <div className="row gap-2" style={{ marginBottom: 8, fontWeight: 600 }}>
            <Check size={16} /> {created.name}
          </div>
          <div className="muted" style={{ fontSize: "0.82rem", marginBottom: 6 }}>
            Account ID — share this to receive money
          </div>
          <code
            className="mono"
            style={{
              display: "block",
              wordBreak: "break-all",
              fontSize: "0.85rem",
              lineHeight: 1.45,
            }}
          >
            {created.id}
          </code>
        </div>
        <div className="row gap-3" style={{ justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              navigator.clipboard
                .writeText(created.id)
                .then(() => toast.success("Account ID copied", { description: created.id }))
                .catch(() => toast.error("Couldn't copy"));
            }}
          >
            <Copy size={16} /> Copy ID
          </button>
          <Link href={`/accounts/${created.id}`} className="btn btn-primary" onClick={onClose}>
            View account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <div className="field">
        <label className="label" htmlFor="account-name">
          Account name
        </label>
        <div className="input-wrap">
          <Landmark className="lead" size={18} />
          <input
            id="account-name"
            className="input has-lead"
            placeholder="e.g. Salary, Savings, Trip fund"
            maxLength={255}
            value={name}
            aria-invalid={!!error}
            onChange={(e) => {
              setName(e.target.value);
              setError(undefined);
            }}
            autoFocus
          />
        </div>
        {error && (
          <span className="error-text" role="alert">
            <AlertCircle size={14} /> {error}
          </span>
        )}
      </div>
      <div className="row gap-3" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <Loader2 size={18} className="spin" /> : <Plus size={18} />}
          {busy ? "Creating…" : "Create account"}
        </button>
      </div>
    </form>
  );
}
