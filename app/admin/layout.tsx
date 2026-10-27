"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, LogOut, Shield } from "lucide-react";
import { toast } from "sonner";
import { BootScreen } from "@/components/BootScreen";
import { Logo } from "@/components/Logo";
import { api } from "@/lib/client/api";

/**
 * Admin shell. /admin/login is rendered without the chrome; every other admin
 * page restores the admin session via /admin/me (cookie).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/admin/login";
  if (isLogin) return <>{children}</>;
  return <AdminShell>{children}</AdminShell>;
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<{ username: string }>("/admin/me", { signal: controller.signal, skipAuthRedirect: true })
      .then(({ data }) => setUsername(data.username))
      .catch(() => {
        router.replace("/admin/login");
      });
    return () => controller.abort();
  }, [router]);

  if (!username) return <BootScreen />;

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Logo href="/admin" />
          <nav className="nav" aria-label="Admin">
            <Link href="/admin" aria-current="page">
              <Shield size={17} /> Credits
            </Link>
          </nav>
          <div className="grow" />
          <div className="user-chip">
            <span className="avatar" aria-hidden>
              A
            </span>
            <span className="name">{username}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon"
              aria-label="Sign out"
              title="Sign out"
              disabled={leaving}
              onClick={async () => {
                setLeaving(true);
                try {
                  await api("/admin/logout", { method: "POST", skipAuthRedirect: true });
                } catch {
                  // Continue locally either way.
                }
                toast.success("Admin signed out");
                router.replace("/admin/login");
              }}
            >
              {leaving ? <Loader2 size={16} className="spin" /> : <LogOut size={16} />}
            </button>
          </div>
        </div>
      </header>
      <main className="container page">{children}</main>
    </>
  );
}
