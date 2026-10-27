import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, lookupSession } from "@/lib/auth/session";

/**
 * Page-level gatekeeper (Next.js 16 "proxy", formerly "middleware").
 *
 * - Anyone without a *valid* session is sent to /login, whatever page they ask for.
 * - A signed-in user opening /login or /register is sent to the dashboard.
 * - The session is verified against the database (not just "a cookie exists"),
 *   so expired, revoked or forged cookies are rejected and cleared.
 *
 * API routes are not matched here: they answer 401 JSON through `requireAuth`,
 * which is the real authorisation boundary. This proxy only decides which
 * *pages* a visitor may open.
 */
const PUBLIC_PAGES = new Set(["/login", "/register"]);

type SessionState = "valid" | "invalid" | "unknown";

async function sessionState(token: string | undefined): Promise<SessionState> {
  if (!token) return "invalid";
  try {
    return (await lookupSession(token)) ? "valid" : "invalid";
  } catch (error) {
    // Database unreachable: fail closed for protected pages, but do not log the user out.
    console.error("[proxy] session lookup failed", error);
    return "unknown";
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PAGES.has(pathname);
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const state = await sessionState(token);

  if (state === "valid") {
    if (isPublic || pathname === "/") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (isPublic) return NextResponse.next();

  const response = NextResponse.redirect(new URL("/login", request.url));
  if (state === "invalid" && token) response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const config = {
  // Pages only: skip API routes, health check, Next internals and any file with an extension.
  matcher: ["/((?!api|health|_next/static|_next/image|_next/webpack-hmr|favicon.ico|.*\\..*).*)"],
};
