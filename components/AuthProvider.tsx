"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, setUnauthorizedHandler, type User } from "@/lib/client/api";

type Status = "loading" | "authenticated" | "anonymous";

type LoginInput =
  | { method: "password"; username: string; password: string }
  | { method: "mpin"; username: string; mpin: string };

interface AuthContextValue {
  status: Status;
  user: User | null;
  login: (input: LoginInput) => Promise<User>;
  register: (input: { name: string; username: string; password: string; mpin: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const statusRef = useRef<Status>("loading");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Restore the session (cookie) on first load.
  useEffect(() => {
    const controller = new AbortController();
    api<User>("/auth/me", { signal: controller.signal, skipAuthRedirect: true })
      .then(({ data }) => {
        setUser(data);
        setStatus("authenticated");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setUser(null);
        setStatus("anonymous");
      });
    return () => controller.abort();
  }, []);

  // Any protected call answered with 401 sends the user back to sign in.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (statusRef.current === "authenticated") {
        toast.warning("Session expired", { description: "Please sign in again to continue." });
      }
      setUser(null);
      setStatus("anonymous");
      // Admin 401s belong on the admin login page, not the user one.
      const path = typeof window !== "undefined" ? window.location.pathname : "";
      router.replace(path.startsWith("/admin") ? "/admin/login" : "/login");
    });
    return () => setUnauthorizedHandler(undefined);
  }, [router]);

  const login = useCallback(async (input: LoginInput) => {
    const { data } = await api<{ user: User }>("/auth/login", {
      method: "POST",
      body: input,
      skipAuthRedirect: true,
    });
    setUser(data.user);
    setStatus("authenticated");
    return data.user;
  }, []);

  const register = useCallback(async (input: {
    name: string;
    username: string;
    password: string;
    mpin: string;
  }) => {
    await api("/auth/register", { method: "POST", body: input, skipAuthRedirect: true });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST", skipAuthRedirect: true });
    } catch {
      // The session is gone either way (expired/revoked); continue signing out locally.
    }
    setUser(null);
    setStatus("anonymous");
    toast.success("Signed out", { description: "See you soon." });
    router.replace("/login");
  }, [router]);

  const value = useMemo(
    () => ({ status, user, login, register, logout }),
    [status, user, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
