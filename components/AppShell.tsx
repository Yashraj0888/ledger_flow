"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowLeftRight, LayoutDashboard, Loader2, LogOut } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/components/AuthProvider";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transfer", label: "Transfer", icon: ArrowLeftRight },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [leaving, setLeaving] = useState(false);

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Logo href="/dashboard" />
          <nav className="nav" aria-label="Main">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
                <Icon size={17} />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <div className="grow" />
          <div className="user-chip">
            <span className="avatar" aria-hidden>
              {user?.username.slice(0, 1)}
            </span>
            <span className="name">{user?.username}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon"
              aria-label="Sign out"
              title="Sign out"
              disabled={leaving}
              onClick={async () => {
                setLeaving(true);
                await logout();
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
