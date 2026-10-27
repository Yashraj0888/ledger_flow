"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2, Lock, LogIn, Shield, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { api, ApiError } from "@/lib/client/api";
import { notifyError } from "@/lib/client/notify";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);

  function validate() {
    const next: typeof errors = {};
    if (!username.trim()) next.username = "Enter the admin username";
    if (!password) next.password = "Enter the admin password";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !validate()) return;
    setBusy(true);
    try {
      await api("/admin/login", {
        method: "POST",
        body: { username: username.trim(), password },
        skipAuthRedirect: true,
      });
      toast.success("Admin signed in", { description: "You can credit any account. Withdraw and transfer are disabled." });
      router.replace("/admin");
    } catch (error) {
      if (error instanceof ApiError && error.code === "INVALID_CREDENTIALS") setPassword("");
      notifyError(error, "Couldn't sign in as admin");
      setBusy(false);
    }
  }

  return (
    <div className="auth-panel" style={{ minHeight: "100vh" }}>
      <div className="card auth-card stack gap-6">
        <div className="stack gap-3">
          <Logo href="/login" />
          <div>
            <h1 className="row gap-2">
              <Shield size={26} style={{ color: "var(--accent)" }} /> Admin
            </h1>
            <p className="muted" style={{ marginTop: 8 }}>
              Credit-only access. You can add money to any user&apos;s account — nothing else.
            </p>
          </div>
        </div>

        <form className="form" onSubmit={onSubmit} noValidate>
          <div className="field">
            <label className="label" htmlFor="admin-user">
              Username
            </label>
            <div className="input-wrap">
              <UserIcon size={18} className="lead" />
              <input
                id="admin-user"
                className="input has-lead"
                autoComplete="username"
                autoFocus
                value={username}
                aria-invalid={!!errors.username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErrors((p) => ({ ...p, username: undefined }));
                }}
              />
            </div>
            {errors.username && (
              <span className="error-text" role="alert">
                <AlertCircle size={14} /> {errors.username}
              </span>
            )}
          </div>

          <div className="field">
            <label className="label" htmlFor="admin-pass">
              Password
            </label>
            <div className="input-wrap">
              <Lock size={18} className="lead" />
              <input
                id="admin-pass"
                className="input has-lead has-trail"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                aria-invalid={!!errors.password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors((p) => ({ ...p, password: undefined }));
                }}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-icon trail"
                style={{ border: 0 }}
                aria-label={show ? "Hide password" : "Show password"}
                onClick={() => setShow((v) => !v)}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && (
              <span className="error-text" role="alert">
                <AlertCircle size={14} /> {errors.password}
              </span>
            )}
          </div>

          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? <Loader2 size={18} className="spin" /> : <LogIn size={18} />}
            {busy ? "Signing in…" : "Sign in as admin"}
          </button>
        </form>

        <p className="auth-foot">
          Not an admin? <Link href="/login">Back to user sign in</Link>
        </p>
      </div>
    </div>
  );
}
