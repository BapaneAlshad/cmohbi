import "server-only";

import { createClient } from "@supabase/supabase-js";
import { serverPublicSupabaseConfig } from "./config";

export function createSupabaseAuthVerifier() {
  const config = serverPublicSupabaseConfig();
  if (!config) return null;
  return createClient(config.url, config.key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
