import "server-only";

import { createClient } from "@supabase/supabase-js";
import { sameSupabaseProject, validSupabaseUrl } from "./config";

export function createSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key || !validSupabaseUrl(url) || !sameSupabaseProject(url, process.env.NEXT_PUBLIC_SUPABASE_URL)) return null;

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
