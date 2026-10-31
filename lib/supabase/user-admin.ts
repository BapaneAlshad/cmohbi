import "server-only";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "./admin";

export async function requireUserManager(request: Request, workspaceId: string) {
  const admin = createSupabaseAdminClient();
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!admin) return { error: NextResponse.json({ error: "Konfigurasi Supabase server belum lengkap." }, { status: 503 }) };
  if (!token) return { error: NextResponse.json({ error: "Sesi login tidak ditemukan." }, { status: 401 }) };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { error: NextResponse.json({ error: "Sesi login tidak valid." }, { status: 401 }) };
  if (!/^[a-f0-9-]{36}$/i.test(workspaceId)) return { error: NextResponse.json({ error: "Workspace tidak valid." }, { status: 400 }) };
  const membership = await admin.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", data.user.id).maybeSingle();
  if (membership.error) return { error: NextResponse.json({ error: "Akses workspace gagal diverifikasi." }, { status: 500 }) };
  if (!["owner", "admin"].includes(membership.data?.role || "")) return { error: NextResponse.json({ error: "Hanya Super Admin dapat mengelola user dan akses." }, { status: 403 }) };
  return { admin, user: data.user };
}
