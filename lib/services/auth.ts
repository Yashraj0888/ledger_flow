import { rpc } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase/server";
import {
  hashSecret,
  verifyAgainstDummy,
  verifySecret,
  type SecretKind,
} from "@/lib/auth/secrets";
import {
  SESSION_TTL_SECONDS,
  generateToken,
  hashToken,
} from "@/lib/auth/session";

export interface RegisterInput {
  name: string;
  username: string;
  password: string;
  mpin: string;
}

export type LoginInput =
  | { method: "password"; username: string; password: string }
  | { method: "mpin"; username: string; mpin: string };

export interface LoginResult {
  token: string;
  token_type: "Bearer";
  expires_at: string;
  user: { id: string; username: string; name: string };
}

const invalidCredentials = () =>
  new AppError("INVALID_CREDENTIALS", "Invalid username or credentials");

function tooManyAttempts(lockedUntil: Date) {
  const retryAfter = Math.max(
    1,
    Math.ceil((lockedUntil.getTime() - Date.now()) / 1000),
  );
  return new AppError(
    "TOO_MANY_ATTEMPTS",
    "Too many failed attempts. Try again later",
    {
      details: { retry_after_seconds: retryAfter },
      headers: { "Retry-After": String(retryAfter) },
    },
  );
}

export async function registerUser(input: RegisterInput) {
  const [passwordHash, mpinHash] = await Promise.all([
    hashSecret("password", input.password),
    hashSecret("mpin", input.mpin),
  ]);

  const { data, error } = await getSupabase()
    .from("users")
    .insert({
      name: input.name,
      username: input.username,
      password_hash: passwordHash,
      mpin_hash: mpinHash,
    })
    .select("id, name, username, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new AppError("USERNAME_TAKEN", "Username is already taken", {
        details: [{ field: "username", message: "Username is already taken" }],
      });
    }
    console.error("[auth] register failed", error);
    throw new Error("Could not create user");
  }

  return {
    id: data.id as string,
    name: data.name as string,
    username: data.username as string,
    created_at: new Date(data.created_at as string).toISOString(),
  };
}

/**
 * Login with either username+password or username+MPIN.
 * - Unknown user and wrong secret return the same 401 (no user enumeration).
 * - 5 consecutive failures lock the user for 15 minutes (shared by both methods).
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const kind: SecretKind = input.method;
  const secret = input.method === "password" ? input.password : input.mpin;

  const { data: user, error } = await getSupabase()
    .from("users")
    .select("id, name, username, password_hash, mpin_hash, locked_until")
    .eq("username", input.username)
    .maybeSingle();

  if (error) {
    console.error("[auth] user lookup failed", error);
    throw new Error("Could not look up user");
  }

  if (!user) {
    await verifyAgainstDummy(kind, secret);
    throw invalidCredentials();
  }

  if (user.locked_until) {
    const lockedUntil = new Date(user.locked_until as string);
    if (lockedUntil.getTime() > Date.now()) throw tooManyAttempts(lockedUntil);
  }

  const stored = (kind === "password" ? user.password_hash : user.mpin_hash) as string;
  const valid = await verifySecret(kind, secret, stored);

  if (!valid) {
    const lockedUntilRaw = await rpc<string | null>("record_login_failure", {
      p_user_id: user.id,
    });
    if (lockedUntilRaw) {
      const lockedUntil = new Date(lockedUntilRaw);
      if (lockedUntil.getTime() > Date.now()) throw tooManyAttempts(lockedUntil);
    }
    throw invalidCredentials();
  }

  const token = generateToken();
  const expiresAt = await rpc<string>("create_session", {
    p_user_id: user.id,
    p_token_hash: hashToken(token),
    p_method: kind,
    p_ttl_seconds: SESSION_TTL_SECONDS,
  });

  return {
    token,
    token_type: "Bearer",
    expires_at: new Date(expiresAt).toISOString(),
    user: {
      id: user.id as string,
      username: user.username as string,
      name: user.name as string,
    },
  };
}

export async function logout(sessionId: string): Promise<void> {
  await rpc("revoke_session", { p_session_id: sessionId });
}
