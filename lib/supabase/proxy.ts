import { NextResponse, type NextRequest } from "next/server";
import { serverPublicSupabaseConfig } from "./config";
import { createCookieSessionClient, sessionResponseHeaders } from "./session";

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = serverPublicSupabaseConfig();
  if (!config) return response;
  const client = createCookieSessionClient({
    getAll: () => request.cookies.getAll(),
    setAll(updates, headers) {
      for (const { name, value } of updates) request.cookies.set(name, value);
      response = NextResponse.next({ request });
      for (const { name, value, options } of updates) response.cookies.set(name, value, options);
      for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    },
  }, config, request.nextUrl.protocol === "https:");
  // Refresh cookies on the server; actual workspace access is checked again in the API.
  // Network failures defer to the browser login/retry UI instead of breaking the page.
  try { await client.auth.getUser(); } catch { /* The session endpoint reports unavailable Auth. */ }
  for (const [key, value] of Object.entries(sessionResponseHeaders)) response.headers.set(key, value);
  return response;
}
