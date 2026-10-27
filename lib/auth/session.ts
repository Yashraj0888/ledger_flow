import { createHash, randomBytes } from "node:crypto";
import { rpc } from "@/lib/db";
import { unauthenticated } from "@/lib/errors";

export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface AuthContext {
  sessionId: string;
  userId: string;
  username: string;
}

export function generateToken(): string {
  return `lf_${randomBytes(32).toString("base64url")}`;
}

/** Only the SHA-256 of a token is stored; a DB leak does not expose live tokens. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const SESSION_COOKIE = "lf_session";

/**
 * Browsers get the session as an HttpOnly + SameSite=Strict cookie, so page
 * JavaScript can never read the token (XSS-safe) and cross-site requests never
 * carry it (CSRF-safe). API clients can keep using the Bearer header.
 */
export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; SameSite=Strict${secure}`;
}

export function clearedSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure}`;
}

function extractCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=") || null;
  }
  return null;
}

function extractToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header) {
    const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
    return match ? match[1] : null;
  }
  return extractCookie(request);
}

/**
 * Resolve the caller from `Authorization: Bearer <token>`.
 * Every protected route calls this first and passes `userId` down to the
 * database functions, which only ever touch that user's own accounts.
 */
export async function requireAuth(request: Request): Promise<AuthContext> {
  const token = extractToken(request);
  if (!token) throw unauthenticated();

  const session = await lookupSession(token);
  if (!session) throw unauthenticated("Invalid, expired or revoked session");
  return session;
}

/**
 * Resolve a raw session token to its owner, or `null` when the token is
 * unknown, expired or revoked. Shared by API routes (`requireAuth`) and the
 * page-level `proxy.ts`, so both apply exactly the same rule.
 */
export async function lookupSession(token: string): Promise<AuthContext | null> {
  const session = await rpc<{
    session_id: string;
    user_id: string;
    username: string;
  } | null>("authenticate_session", { p_token_hash: hashToken(token) });

  if (!session) return null;
  return {
    sessionId: session.session_id,
    userId: session.user_id,
    username: session.username,
  };
}
