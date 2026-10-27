"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Hash,
  Loader2,
  Lock,
  Rocket,
  User as UserIcon,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { ApiError } from "@/lib/client/api";
import { notifyError } from "@/lib/client/notify";

type Errors = Partial<Record<"name" | "username" | "password" | "mpin" | "confirm", string>>;

function strength(password: string): { level: number; label: string } {
  if (!password) return { level: 0, label: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  const level = Math.max(1, score);
  return { level, label: ["", "Weak", "Okay", "Good", "Strong"][level] };
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <span className="error-text" role="alert">
      <AlertCircle size={14} /> {message}
    </span>
  );
}

export default function RegisterPage() {
  const { register, login } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mpin, setMpin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const meter = strength(password);

  function clear(field: keyof Errors) {
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validate(): boolean {
    const next: Errors = {};
    if (!name.trim()) next.name = "Enter your name";
    else if (name.trim().length > 80) next.name = "Keep it under 80 characters";
    if (!/^[A-Za-z0-9_]{3,32}$/.test(username.trim())) {
      next.username = "3 to 32 characters: letters, numbers or underscore";
    }
    if (password.length < 8) next.password = "Use at least 8 characters";
    if (!/^\d{4,6}$/.test(mpin)) next.mpin = "MPIN must be 4 to 6 digits";
    if (confirm !== mpin) next.confirm = "MPINs don't match";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !validate()) return;
    setBusy(true);
    const displayName = name.trim();
    const loginName = username.trim();
    try {
      await register({ name: displayName, username: loginName, password, mpin });
    } catch (error) {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors;
        setErrors({
          name: fields.name,
          username: fields.username,
          password: fields.password,
          mpin: fields.mpin,
        });
      }
      notifyError(error, "Couldn't create your account");
      setBusy(false);
      return;
    }

    try {
      const user = await login({ method: "password", username: loginName, password });
      toast.success(`Welcome to LedgerFlow, ${user.name}!`, {
        description: "Your profile is ready. Let's open your first account.",
      });
      router.replace("/dashboard");
    } catch (error) {
      toast.success("Profile created", { description: "Please sign in to continue." });
      notifyError(error, "Couldn't sign you in automatically");
      router.replace("/login");
    }
  }

  return (
    <div className="card auth-card stack gap-6">
      <div>
        <h1>Create your profile</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          Your name is what we show in the app. Username is only for signing in.
        </p>
      </div>

      <form className="form" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label className="label" htmlFor="name">
            Your name
          </label>
          <div className="input-wrap">
            <UserRound className="lead" size={18} />
            <input
              id="name"
              className="input has-lead"
              autoComplete="name"
              placeholder="e.g. Alice Khan"
              maxLength={80}
              value={name}
              aria-invalid={!!errors.name}
              onChange={(e) => {
                setName(e.target.value);
                clear("name");
              }}
              autoFocus
            />
          </div>
          <FieldError message={errors.name} />
        </div>

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
              placeholder="e.g. alice_k"
              maxLength={32}
              value={username}
              aria-invalid={!!errors.username}
              onChange={(e) => {
                setUsername(e.target.value);
                clear("username");
              }}
            />
          </div>
          <span className="hint">Used to sign in — letters, numbers or underscore.</span>
          <FieldError message={errors.username} />
        </div>

        <div className="field">
          <label className="label" htmlFor="password">
            Password
          </label>
          <div className="input-wrap">
            <Lock className="lead" size={18} />
            <input
              id="password"
              className="input has-lead has-trail"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              maxLength={128}
              value={password}
              aria-invalid={!!errors.password}
              onChange={(e) => {
                setPassword(e.target.value);
                clear("password");
              }}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon trail"
              style={{ border: 0 }}
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((s) => !s)}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          {password && (
            <>
              <div className="strength" data-level={meter.level} aria-hidden>
                <i /> <i /> <i /> <i />
              </div>
              <span className="hint">Strength: {meter.label}</span>
            </>
          )}
          <FieldError message={errors.password} />
        </div>

        <div className="row gap-3" style={{ alignItems: "flex-start" }}>
          <div className="field grow">
            <label className="label" htmlFor="mpin">
              MPIN
            </label>
            <div className="input-wrap">
              <input
                id="mpin"
                className="input pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                placeholder="••••"
                value={mpin}
                aria-invalid={!!errors.mpin}
                onChange={(e) => {
                  setMpin(e.target.value.replace(/\D/g, "").slice(0, 6));
                  clear("mpin");
                }}
              />
            </div>
            <FieldError message={errors.mpin} />
          </div>
          <div className="field grow">
            <label className="label" htmlFor="confirm">
              Confirm MPIN
            </label>
            <input
              id="confirm"
              className="input pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              placeholder="••••"
              value={confirm}
              aria-invalid={!!errors.confirm}
              onChange={(e) => {
                setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6));
                clear("confirm");
              }}
            />
            <FieldError message={errors.confirm} />
          </div>
        </div>
        <span className="hint" style={{ marginTop: -8 }}>
          <Hash size={12} style={{ verticalAlign: "-1px" }} /> Your MPIN is stored encrypted (hashed), never as plain digits.
        </span>

        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? <Loader2 size={18} className="spin" /> : <Rocket size={18} />}
          {busy ? "Creating profile…" : "Create profile"}
        </button>
      </form>

      <p className="auth-foot">
        Already have a profile? <Link href="/login">Sign in</Link>
      </p>
    </div>
  );
}
