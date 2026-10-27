"use client";

import { useState } from "react";
import { AlertCircle, Landmark, Loader2, Plus } from "lucide-react";
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
      description="It starts with a balance of zero. Add money once it's created."
    >
      <NewAccountForm onClose={onClose} onCreated={onCreated} />
    </Modal>
  );
}

function NewAccountForm({ onClose, onCreated }: Omit<Props, "open">) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

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
      toast.success("Account created", {
        description: `“${data.name}” is ready with a balance of ${formatMoney(data.balance)}.`,
      });
      onCreated(data);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.name) setError(err.fieldErrors.name);
      notifyError(err, "Couldn't create the account");
      setBusy(false);
    }
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
