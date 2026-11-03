export function validSupabaseUrl(value?: string) {
  try { const url = new URL(value || ""); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}

export function sameSupabaseProject(serverUrl?: string, publicUrl?: string) {
  if (!serverUrl || !publicUrl) return true;
  try { return new URL(serverUrl).href.replace(/\/$/, "") === new URL(publicUrl).href.replace(/\/$/, ""); }
  catch { return false; }
}

export type SupabasePublicConfig = { url: string; key: string };

export function isPublishableSupabaseKey(value?: string) {
  if (!value) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  // Legacy anon keys remain supported. A service-role JWT is never a public key.
  try {
    const parts = value.split(".");
    return parts.length === 3 && JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "anon";
  } catch { return false; }
}

export function publicSupabaseConfig(
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
): SupabasePublicConfig | null {
  return url && key && validSupabaseUrl(url) && isPublishableSupabaseKey(key) ? { url, key } : null;
}

export function serverPublicSupabaseConfig(): SupabasePublicConfig | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!sameSupabaseProject(url, process.env.NEXT_PUBLIC_SUPABASE_URL)) return null;
  return publicSupabaseConfig(url);
}
