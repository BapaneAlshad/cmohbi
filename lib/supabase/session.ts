import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverPublicSupabaseConfig, type SupabasePublicConfig } from "./config.ts";

export const sessionResponseHeaders = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

export class SessionAccessError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export function requestBearerToken(authorization: string | null) {
  if (authorization === null) return undefined;
  const token = authorization.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) throw new SessionAccessError("Sesi login tidak valid.", 401);
  return token;
}

export function createSupabaseSessionClient(cookies: CookieMethodsServer, bearerToken?: string, config = serverPublicSupabaseConfig(), secure = false) {
  if (!config) throw new SessionAccessError("Konfigurasi Supabase belum lengkap atau tidak sesuai.", 503);
  // A new client per request prevents sessions leaking between users in warm servers.
  return bearerToken
    ? createClient(config.url, config.key, { global: { headers: { Authorization: `Bearer ${bearerToken}` }, fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    : createCookieSessionClient(cookies, config, secure);
}

export function createCookieSessionClient(cookies: CookieMethodsServer, config: SupabasePublicConfig, secure = false) {
  return createServerClient(config.url, config.key, {
    cookies,
    cookieOptions: { sameSite: "lax", path: "/", secure },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

export async function verifiedSessionUser(client: SupabaseClient, bearerToken?: string) {
  const { data, error } = await client.auth.getUser(bearerToken);
  if (error || !data.user) {
    if (error && (error.name === "AuthRetryableFetchError" || (error.status || 0) >= 500)) {
      throw new SessionAccessError("Supabase belum dapat dihubungi. Periksa koneksi dan coba lagi.", 503);
    }
    throw new SessionAccessError("Sesi login tidak valid atau sudah berakhir.", 401);
  }
  return data.user;
}
