import { NextRequest, NextResponse } from "next/server";
import { isValidPin, isValidUsername, normalizeUsername } from "@/lib/auth-identity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
}

export async function POST(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const token = bearerToken(request);
  if (!admin) return NextResponse.json({ error: "Konfigurasi Supabase server belum lengkap." }, { status: 503 });
  if (!token) return NextResponse.json({ error: "Sesi login tidak ditemukan." }, { status: 401 });

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Sesi login tidak valid atau sudah berakhir." }, { status: 401 });

  const [actorProfile, actorMembership] = await Promise.all([
    admin.from("profiles").select("job_title").eq("id", authData.user.id).maybeSingle(),
    admin.from("workspace_members").select("role").eq("user_id", authData.user.id).limit(1).maybeSingle(),
  ]);
  if (actorProfile.error || actorMembership.error) {
    return NextResponse.json({ error: (actorProfile.error || actorMembership.error)?.message || "Akses tidak dapat diverifikasi." }, { status: 500 });
  }

  const title = String(actorProfile.data?.job_title ?? "").trim().toLowerCase();
  const role = String(actorMembership.data?.role ?? "").trim().toLowerCase();
  const allowed = role === "owner" || role === "admin" || title === "cmo" || title === "super admin";
  if (!allowed) return NextResponse.json({ error: "Reset PIN hanya dapat dilakukan oleh Super Admin atau CMO." }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const username = normalizeUsername(String(body?.username ?? ""));
  const pin = String(body?.pin ?? "");
  if (!isValidUsername(username)) return NextResponse.json({ error: "Username tidak valid." }, { status: 400 });
  if (!isValidPin(pin)) return NextResponse.json({ error: "PIN harus terdiri dari 6 angka." }, { status: 400 });

  const target = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (target.error) return NextResponse.json({ error: target.error.message }, { status: 500 });
  if (!target.data) return NextResponse.json({ error: "Username tidak ditemukan." }, { status: 404 });

  const { error: updateError } = await admin.auth.admin.updateUserById(target.data.id, { password: pin });
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ message: `PIN untuk ${username} berhasil direset.` });
}
