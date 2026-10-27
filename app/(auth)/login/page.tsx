"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Hash, Loader2, Lock, LogIn, Shield, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { ApiError } from "@/lib/client/api";
import { notifyError } from "@/lib/client/notify";

type Method = "password" | "mpin";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [method, setMethod] = useState<Method>("password");
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; secret?: string }>({});
  const [busy, setBusy] = useState(false);

  function switchMethod(next: Method) {
    setMethod(next);
    setSecret("");
    setShowSecret(false);
    setErrors({});
  }

  function validate() {
    const next: typeof errors = {};
    if (!username.trim()) next.username = "Enter your username";
    if (method === "password" && !secret) next.secret = "Enter your password";
    if (method === "mpin" && !/^\d{4,6}$/.test(secret)) next.secret = "MPIN is 4 to 6 digits";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !validate()) return;
    setBusy(true);
    try {
      const user = await login(
        method === "password"
          ? { method, username: username.trim(), password: secret }
          : { method, username: username.trim(), mpin: secret },
      );
      toast.success(`Welcome back, ${user.name}`, {
        description: method === "mpin" ? "Signed in with your MPIN." : "Signed in with your password.",
      });
      router.replace("/dashboard");
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors) {
        const fields = error.fieldErrors;
        if (fields.username || fields.password || fields.mpin) {
          setErrors({ username: fields.username, secret: fields.password ?? fields.mpin });
        }
      }
      if (error instanceof ApiError && error.code === "INVALID_CREDENTIALS") setSecret("");
      notifyError(error, "Couldn't sign you in");
      setBusy(false);
    }
  }

  return (
    <div className="card auth-card stack gap-6">
      <div>
        <h1>Welcome back</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          Sign in to your ledger.
        </p>
      </div>

      <div className="segmented" role="tablist" aria-label="Sign-in method">
        <button type="button" role="tab" aria-selected={method === "password"} onClick={() => switchMethod("password")}>
          <Lock size={16} /> Password
        </button>
        <button type="button" role="tab" aria-selected={method === "mpin"} onClick={() => switchMethod("mpin")}>
          <Hash size={16} /> MPIN
        </button>
      </div>

      <form className="form" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label className="label" htmlFor="username">
            Username
          </label>
          <div className="input-wrap">
            <UserIcon className="lead" size={18} />
            <input
              id="username"
              className="input has-lead"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="e.g. alice"
              value={username}
              aria-invalid={!!errors.username}
              onChange={(e) => {
                setUsername(e.target.value);
                setErrors((p) => ({ ...p, username: undefined }));
              }}
              autoFocus
            />
          </div>
          {errors.username && (
            <span className="error-text" role="alert">
              <AlertCircle size={14} /> {errors.username}
            </span>
          )}
        </div>

        <div className="field">
          <label className="label" htmlFor="secret">
            {method === "password" ? "Password" : "MPIN"}
          </label>
          {method === "password" ? (
            <div className="input-wrap">
              <Lock className="lead" size={18} />
              <input
                id="secret"
                className="input has-lead has-trail"
                type={showSecret ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Your password"
                value={secret}
                aria-invalid={!!errors.secret}
                onChange={(e) => {
                  setSecret(e.target.value);
                  setErrors((p) => ({ ...p, secret: undefined }));
                }}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-icon trail"
                style={{ border: 0 }}
                aria-label={showSecret ? "Hide password" : "Show password"}
                onClick={() => setShowSecret((s) => !s)}
              >
                {showSecret ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          ) : (
            <input
              id="secret"
              className="input pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              placeholder="••••"
              value={secret}
              aria-invalid={!!errors.secret}
              onChange={(e) => {
                setSecret(e.target.value.replace(/\D/g, "").slice(0, 6));
                setErrors((p) => ({ ...p, secret: undefined }));
              }}
            />
          )}
          {errors.secret ? (
            <span className="error-text" role="alert">
              <AlertCircle size={14} /> {errors.secret}
            </span>
          ) : (
            method === "mpin" && <span className="hint">The 4 to 6 digit PIN you set when registering.</span>
          )}
        </div>

        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? <Loader2 size={18} className="spin" /> : <LogIn size={18} />}
          {busy ? "Signing in…" : method === "mpin" ? "Sign in with MPIN" : "Sign in"}
        </button>
      </form>

      <p className="auth-foot">
        New to LedgerFlow? <Link href="/register">Create an account</Link>
      </p>
      <p className="auth-foot" style={{ marginTop: -8 }}>
        <Link href="/admin/login" className="row gap-2" style={{ justifyContent: "center", color: "var(--muted)", fontWeight: 500 }}>
          <Shield size={14} /> Login as admin
        </Link>
      </p>
    </div>
  );
}
