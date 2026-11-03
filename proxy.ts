import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSupabaseSession(request);
}

// API handlers verify Bearer/cookie sessions themselves. Assets and webhooks skip refresh.
export const config = { matcher: ["/"] };
