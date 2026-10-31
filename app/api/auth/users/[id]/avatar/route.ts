import { NextRequest, NextResponse } from "next/server";
import { requireUserManager } from "@/lib/supabase/user-admin";
import { USER_AVATAR_BUCKET, userAvatarExtension, validateUserAvatar } from "@/lib/user-avatar";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Reject unauthenticated uploads before reading multipart data.
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) return NextResponse.json({ error: "Sesi login tidak ditemukan." }, { status: 401 });
  if (Number(request.headers.get("content-length") || 0) > 2 * 1024 * 1024 + 65536) return NextResponse.json({ error: "Ukuran foto maksimal 2 MB." }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const workspaceId = String(form?.get("workspaceId") || "");
  const context = await requireUserManager(request, workspaceId);
  if (context.error) return context.error;
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) return NextResponse.json({ error: "User tidak valid." }, { status: 400 });
  const member = await context.admin!.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("user_id", id).maybeSingle();
  if (member.error) return NextResponse.json({ error: "User gagal diverifikasi." }, { status: 500 });
  if (!member.data) return NextResponse.json({ error: "User tidak ditemukan di workspace ini." }, { status: 404 });
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Pilih foto profil." }, { status: 400 });
  const validation = validateUserAvatar(file);
  if (validation) return NextResponse.json({ error: validation }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer()), extension = userAvatarExtension(bytes, file.type);
  if (!extension) return NextResponse.json({ error: "Isi file tidak sesuai format foto." }, { status: 400 });
  const bucket = context.admin!.storage.from(USER_AVATAR_BUCKET);
  const result = await bucket.upload(`${workspaceId}/${id}/${crypto.randomUUID()}.${extension}`, bytes, { contentType: file.type, upsert: false });
  if (result.error) return NextResponse.json({ error: "Foto gagal diunggah. Pastikan migrasi foto profil sudah tersedia." }, { status: 400 });
  return NextResponse.json({ url: bucket.getPublicUrl(result.data.path).data.publicUrl }, { status: 201 });
}
