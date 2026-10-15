import { NextRequest, NextResponse } from "next/server";
import { authEmailFromUsername, isValidPin, isValidUsername, normalizeUsername } from "@/lib/auth-identity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
}

const allowedTitles = new Set(["Content Creator", "Creative Designer", "Support Marketing", "Tim Konten", "Guest"]);

export async function POST(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const token = bearerToken(request);
  if (!admin || !token) return NextResponse.json({ error: "Konfigurasi atau sesi login tidak tersedia." }, { status: 401 });

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Sesi login tidak valid atau sudah berakhir." }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const workspaceId = String(body?.workspaceId || "");
  const username = normalizeUsername(String(body?.username || ""));
  const fullName = String(body?.fullName || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const whatsapp = String(body?.whatsapp || "").trim();
  const pin = String(body?.pin || "");
  const jobTitle = String(body?.jobTitle || "").trim();
  if (!workspaceId) return NextResponse.json({ error: "Workspace tidak ditemukan." }, { status: 400 });
  if (!isValidUsername(username)) return NextResponse.json({ error: "Username tidak valid." }, { status: 400 });
  if (fullName.length < 2 || !email.includes("@") || whatsapp.length < 8) return NextResponse.json({ error: "Profil anggota belum lengkap." }, { status: 400 });
  if (!isValidPin(pin)) return NextResponse.json({ error: "PIN harus terdiri dari 6 angka." }, { status: 400 });
  if (!allowedTitles.has(jobTitle)) return NextResponse.json({ error: "Peran anggota tidak valid." }, { status: 400 });

  const actorMembership = await admin.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", authData.user.id).maybeSingle();
  if (actorMembership.error) return NextResponse.json({ error: actorMembership.error.message }, { status: 500 });
  if (!actorMembership.data || !["owner", "admin"].includes(actorMembership.data.role)) return NextResponse.json({ error: "Hanya owner/admin yang dapat menambah anggota." }, { status: 403 });

  const existingProfile = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (existingProfile.error) return NextResponse.json({ error: existingProfile.error.message }, { status: 500 });
  if (existingProfile.data) return NextResponse.json({ error: "Username sudah digunakan." }, { status: 409 });

  const created = await admin.auth.admin.createUser({
    email: authEmailFromUsername(username),
    password: pin,
    email_confirm: true,
    user_metadata: { full_name: fullName, username, email, whatsapp },
  });
  if (created.error || !created.data.user) return NextResponse.json({ error: created.error?.message || "Akun anggota gagal dibuat." }, { status: 400 });

  const profile = await admin.from("profiles").insert({ id: created.data.user.id, username, full_name: fullName, email, whatsapp, job_title: jobTitle });
  if (profile.error) {
    await admin.auth.admin.deleteUser(created.data.user.id);
    return NextResponse.json({ error: profile.error.message }, { status: 500 });
  }
  const membership = await admin.from("workspace_members").insert({ workspace_id: workspaceId, user_id: created.data.user.id, role: "member" });
  if (membership.error) {
    await admin.from("profiles").delete().eq("id", created.data.user.id);
    await admin.auth.admin.deleteUser(created.data.user.id);
    return NextResponse.json({ error: membership.error.message }, { status: 500 });
  }

  return NextResponse.json({ user: { name: fullName, username, email, whatsapp, role: jobTitle, status: "Aktif" } }, { status: 201 });
}
