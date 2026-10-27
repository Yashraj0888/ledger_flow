import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, lookupAdminSession } from "@/lib/auth/admin";
import { SESSION_COOKIE, lookupSession } from "@/lib/auth/session";

/**
 * Page-level gatekeeper (Next.js 16 "proxy").
 *
 * User area (`/dashboard`, `/accounts`, `/transfer`, …):
 *   - no valid user session → /login
 *   - signed-in user on /login or /register → /dashboard
 *
 * Admin area (`/admin/...`):
 *   - /admin/login is public; a valid admin session is redirected to /admin
 *   - every other /admin page needs a valid admin session
 *
 * Sessions are verified against the database (forged/expired/revoked cookies
 * are rejected and cleared). API routes are not matched here.
 */
const USER_PUBLIC = new Set(["/login", "/register"]);

type SessionState = "valid" | "invalid" | "unknown";

async function userState(token: string | undefined): Promise<SessionState> {
  if (!token) return "invalid";
  try {
    return (await lookupSession(token)) ? "valid" : "invalid";
  } catch (error) {
    console.error("[proxy] user session lookup failed", error);
    return "unknown";
  }
}

async function adminState(token: string | undefined): Promise<SessionState> {
  if (!token) return "invalid";
  try {
    return (await lookupAdminSession(token)) ? "valid" : "invalid";
  } catch (error) {
    console.error("[proxy] admin session lookup failed", error);
    return "unknown";
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAdminPath) {
    const token = request.cookies.get(ADMIN_COOKIE)?.value;
    const state = await adminState(token);
    const isLogin = pathname === "/admin/login";

    if (state === "valid") {
      if (isLogin) return NextResponse.redirect(new URL("/admin", request.url));
      return NextResponse.next();
    }

    if (isLogin) return NextResponse.next();

    const response = NextResponse.redirect(new URL("/admin/login", request.url));
    if (state === "invalid" && token) response.cookies.delete(ADMIN_COOKIE);
    return response;
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const state = await userState(token);
  const isPublic = USER_PUBLIC.has(pathname);

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
  matcher: ["/((?!api|health|_next/static|_next/image|_next/webpack-hmr|favicon.ico|.*\\..*).*)"],
};
