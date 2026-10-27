import { timingSafeEqual } from "node:crypto";
import { rpc } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { AppError, unauthenticated } from "@/lib/errors";
import {
  SESSION_TTL_SECONDS,
  generateToken,
  hashToken,
} from "@/lib/auth/session";

export const ADMIN_COOKIE = "lf_admin";

export function adminCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_COOKIE}=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; SameSite=Strict${secure}`;
}

export function clearedAdminCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure}`;
}

function extractAdminCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === ADMIN_COOKIE) return rest.join("=") || null;
  }
  return null;
}

function extractAdminToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header) {
    const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
    if (match) return match[1];
  }
  return extractAdminCookie(request);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    // Still compare something of equal length so timing does not leak length.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export async function loginAdmin(input: {
  username: string;
  password: string;
}): Promise<{ token: string; expires_at: string; admin: { username: string } }> {
  const env = getEnv();
  const usernameOk = safeEqual(input.username.trim().toLowerCase(), env.ADMIN_USERNAME.trim().toLowerCase());
  const passwordOk = safeEqual(input.password, env.ADMIN_PASSWORD);

  if (!usernameOk || !passwordOk) {
    throw new AppError("INVALID_CREDENTIALS", "Invalid username or credentials");
  }

  const token = generateToken();
  const expiresAt = await rpc<string>("create_admin_session", {
    p_token_hash: hashToken(token),
    p_ttl_seconds: SESSION_TTL_SECONDS,
  });

  return {
    token,
    expires_at: new Date(expiresAt).toISOString(),
    admin: { username: env.ADMIN_USERNAME },
  };
}

export async function lookupAdminSession(token: string): Promise<boolean> {
  return rpc<boolean>("authenticate_admin_session", {
    p_token_hash: hashToken(token),
  });
}

export async function requireAdmin(request: Request): Promise<{ token: string }> {
  const token = extractAdminToken(request);
  if (!token) throw unauthenticated("Admin authentication required");
  const ok = await lookupAdminSession(token);
  if (!ok) throw unauthenticated("Invalid, expired or revoked admin session");
  return { token };
}

export async function logoutAdmin(token: string): Promise<void> {
  await rpc("revoke_admin_session", { p_token_hash: hashToken(token) });
}
