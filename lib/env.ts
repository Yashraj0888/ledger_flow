import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  AUTH_PEPPER: z.string().min(32),
  // Single env-configured admin. Not a row in `users`; sessions live in `admin_sessions`.
  ADMIN_USERNAME: z.string().trim().min(3).max(64),
  ADMIN_PASSWORD: z.string().min(8).max(128),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Validated server-side configuration. Throws (-> 500) if misconfigured. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment. Check: ${missing}`);
  }
  cached = parsed.data;
  return cached;
}
