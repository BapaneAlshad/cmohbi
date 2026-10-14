import { NextRequest, NextResponse } from "next/server";
import { authEmailFromUsername, isValidPin, isValidUsername, normalizeUsername } from "@/lib/auth-identity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Konfigurasi Supabase server belum lengkap." }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const username = normalizeUsername(String(body?.username ?? ""));
  const fullName = String(body?.fullName ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const whatsapp = String(body?.whatsapp ?? "").trim();
  const pin = String(body?.pin ?? "");

  if (!isValidUsername(username)) {
    return NextResponse.json({ error: "Username harus 3–32 karakter, diawali huruf, dan hanya boleh berisi huruf kecil, angka, titik, garis bawah, atau tanda hubung." }, { status: 400 });
  }
  if (fullName.length < 2) return NextResponse.json({ error: "Nama lengkap wajib diisi." }, { status: 400 });
  if (!email.includes("@")) return NextResponse.json({ error: "Email profil tidak valid." }, { status: 400 });
  if (whatsapp.length < 8) return NextResponse.json({ error: "Nomor WhatsApp wajib diisi." }, { status: 400 });
  if (!isValidPin(pin)) return NextResponse.json({ error: "PIN harus terdiri dari 6 angka." }, { status: 400 });

  const existingProfile = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (existingProfile.error) return NextResponse.json({ error: existingProfile.error.message }, { status: 500 });
  if (existingProfile.data) return NextResponse.json({ error: "Username sudah digunakan." }, { status: 409 });

  const profileCount = await admin.from("profiles").select("id", { count: "exact", head: true });
  if (profileCount.error) return NextResponse.json({ error: profileCount.error.message }, { status: 500 });

  const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
    email: authEmailFromUsername(username),
    password: pin,
    email_confirm: true,
    user_metadata: { full_name: fullName, username, email, whatsapp },
  });
  if (createUserError || !createdUser.user) {
    return NextResponse.json({ error: createUserError?.message || "Akun gagal dibuat." }, { status: 400 });
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: createdUser.user.id,
    username,
    full_name: fullName,
    email,
    whatsapp,
    job_title: (profileCount.count ?? 0) === 0 ? "CMO" : "Member",
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(createdUser.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ userId: createdUser.user.id }, { status: 201 });
}
