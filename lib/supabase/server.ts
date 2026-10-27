import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

let client: SupabaseClient | undefined;

/**
 * Service-role client. SERVER ONLY - never import this from a client component.
 * The database denies all access to anon/authenticated roles, so this is the
 * only path to the data and every call below it must carry the user id.
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const env = getEnv();
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
