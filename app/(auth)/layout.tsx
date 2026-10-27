"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Lock, ShieldCheck, Zap } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { BootScreen } from "@/components/BootScreen";
import { Logo } from "@/components/Logo";

const FEATURES = [
  { icon: KeyRound, title: "Two ways to sign in", text: "Use your password, or jump in fast with your MPIN." },
  { icon: Lock, title: "Private by design", text: "You only ever see and move money in your own accounts." },
  { icon: ShieldCheck, title: "Every rupee accounted for", text: "Atomic transactions. Balances can never drift from the ledger." },
  { icon: Zap, title: "Instant transfers", text: "Move money between your accounts in a single safe step." },
];

/** Split-screen layout for login / register. Signed-in users are sent to the dashboard. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  if (status !== "anonymous") return <BootScreen />;

  return (
    <div className="auth-shell">
      <aside className="auth-brand">
        <Logo />
        <div className="stack gap-6" style={{ position: "relative", zIndex: 1 }}>
          <h2>Your money, moving in flow.</h2>
          <div className="feature-list">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div className="feature" key={title}>
                <span className="ico">
                  <Icon size={19} />
                </span>
                <div>
                  <b>{title}</b>
                  <span>{text}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <span className="muted" style={{ position: "relative", zIndex: 1, fontSize: "0.82rem" }}>
          © LedgerFlow
        </span>
      </aside>
      <section className="auth-panel">{children}</section>
    </div>
  );
}
