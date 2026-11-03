import { createClient } from "@supabase/supabase-js";
import { serverPublicSupabaseConfig } from "../lib/supabase/config.ts";

const config = serverPublicSupabaseConfig();
if (!config) {
  console.error("Konfigurasi Supabase URL/publishable key belum valid atau URL server berbeda.");
  process.exit(1);
}

try {
  console.log(`Project: ${new URL(config.url).hostname}`);
  const health = await fetch(`${config.url.replace(/\/$/, "")}/auth/v1/health`, { headers: { apikey: config.key }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!health.ok) throw new Error(`Auth belum siap (HTTP ${health.status}).`);
  console.log("Auth API: terhubung");
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Secret server belum tersedia untuk memeriksa schema/provisioning. Login biasa memakai publishable key dan RLS.");
  const admin = createClient(config.url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const checks = await Promise.all([
    admin.from("profiles").select("id,username,job_title").limit(0),
    admin.from("workspace_members").select("workspace_id,user_id,role").limit(0),
    admin.from("campaigns").select("id,row_version,content_config").limit(0),
    admin.from("tasks").select("id,content_calendar_type").limit(0),
    admin.from("task_status_requests").select("id").limit(0),
    admin.from("influencer_bookings").select("id,content_link").limit(0),
    admin.rpc("campaign_schema_version"),
  ]);
  const modules = ["profiles", "workspace_members", "campaigns", "tasks", "task_status_requests", "influencer_bookings", "campaign_schema_version"];
  const missing = checks.flatMap((check, index) => check.error ? [`${modules[index]} (${check.error.code})`] : []);
  if (missing.length) throw new Error(`Schema aplikasi belum siap: ${missing.join(", ")}. Review dan terapkan migrasi terlebih dahulu.`);
  if (checks.at(-1).data !== 1) throw new Error("Versi schema Campaign belum sesuai.");
  console.log("Schema aplikasi: siap");
  const owners = await admin.from("workspace_members").select("user_id", { count: "exact", head: true }).in("role", ["owner", "admin"]);
  if (owners.error || !owners.count) throw new Error("Super Admin workspace belum diprovisikan; login tidak membuat akun otomatis.");
  console.log("Super Admin: tersedia");
  console.log("Pemeriksaan koneksi selesai. Jalankan login nyata untuk menguji session dan akses RLS pengguna.");
} catch (error) {
  // Never print credentials, provider payloads or user records.
  console.error(error.cause ? "Koneksi Supabase gagal. Periksa DNS/jaringan dan Project URL." : error.message);
  process.exitCode = 1;
}
