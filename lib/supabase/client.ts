import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseConfig } from "./config";

export function isSupabaseConfigured() {
  return Boolean(publicSupabaseConfig());
}

export function createSupabaseBrowserClient() {
  const config = publicSupabaseConfig();
  return config ? createBrowserClient(config.url, config.key, { cookieOptions: { sameSite: "lax", path: "/", secure: typeof window !== "undefined" && window.location.protocol === "https:" } }) : null;
}
