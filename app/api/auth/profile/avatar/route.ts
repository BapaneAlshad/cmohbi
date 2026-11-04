import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { USER_AVATAR_BUCKET, isManagedAvatarUrl, userAvatarExtension, validateUserAvatar } from "@/lib/user-avatar";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "Sesi login tidak ditemukan." }, { status: 401 });
  if (Number(request.headers.get("content-length") || 0) > 2 * 1024 * 1024 + 65536) return NextResponse.json({ error: "Ukuran foto maksimal 2 MB." }, { status: 413 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Form unggahan foto tidak valid." }, { status: 400 });
  const workspaceId = String(form.get("workspaceId") || "");
  if (!/^[a-f0-9-]{36}$/i.test(workspaceId)) return NextResponse.json({ error: "Workspace tidak valid." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Konfigurasi Supabase server belum lengkap." }, { status: 503 });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData.user;
  if (authError || !user) return NextResponse.json({ error: "Sesi login tidak valid." }, { status: 401 });

  const membership = await admin.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  if (membership.error) return NextResponse.json({ error: "Akses workspace gagal diverifikasi." }, { status: 500 });
  if (!membership.data) return NextResponse.json({ error: "Anda bukan anggota workspace ini." }, { status: 403 });

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Pilih foto profil." }, { status: 400 });
  const validation = validateUserAvatar(file);
  if (validation) return NextResponse.json({ error: validation }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = userAvatarExtension(bytes, file.type);
  if (!extension) return NextResponse.json({ error: "Isi file tidak sesuai format foto." }, { status: 400 });

  const profile = await admin.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();
  if (profile.error || !profile.data) return NextResponse.json({ error: "Profil akun gagal diverifikasi." }, { status: 500 });

  const bucket = admin.storage.from(USER_AVATAR_BUCKET);
  const path = `${workspaceId}/${user.id}/${crypto.randomUUID()}.${extension}`;
  const uploaded = await bucket.upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploaded.error) return NextResponse.json({ error: "Foto gagal diunggah. Pastikan penyimpanan foto profil tersedia." }, { status: 400 });

  const url = bucket.getPublicUrl(path).data.publicUrl;
  const saved = await admin.from("profiles").update({ avatar_url: url, updated_at: new Date().toISOString() }).eq("id", user.id).select("id").maybeSingle();
  if (saved.error || !saved.data) {
    try { await bucket.remove([path]); } catch { /* Keep the profile error as the primary response. */ }
    return NextResponse.json({ error: "Foto berhasil diunggah, tetapi profil gagal diperbarui." }, { status: 500 });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const previousUrl = profile.data.avatar_url;
  if (previousUrl && isManagedAvatarUrl(previousUrl, supabaseUrl, workspaceId, user.id)) {
    const oldPath = new URL(previousUrl).pathname.replace(`/storage/v1/object/public/${USER_AVATAR_BUCKET}/`, "");
    if (oldPath && oldPath !== path) {
      try { await bucket.remove([oldPath]); } catch { /* Profile is already saved; old media cleanup is best effort. */ }
    }
  }

  return NextResponse.json({ url }, { status: 201 });
}
