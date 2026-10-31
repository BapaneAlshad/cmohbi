import { NextRequest, NextResponse } from "next/server";
import { requireUserManager } from "@/lib/supabase/user-admin";
import { normalizeUsername } from "@/lib/auth-identity";
import { validateManagedUser, type ManagedUserInput } from "@/lib/user-management";
import { isManagedAvatarUrl } from "@/lib/user-avatar";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const workspaceId = String(body?.workspaceId || "");
  const context = await requireUserManager(request, workspaceId);
  if (context.error) return context.error;
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) return NextResponse.json({ error: "User tidak valid." }, { status: 400 });
  const input: ManagedUserInput = { name: String(body?.name || "").trim(), username: normalizeUsername(String(body?.username || "")), email: String(body?.email || "").trim().toLowerCase(), whatsapp: String(body?.whatsapp || "").trim(), role: String(body?.role || ""), accessRole: body?.accessRole as ManagedUserInput["accessRole"] };
  const error = validateManagedUser(input);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (body && Object.hasOwn(body, "avatarUrl")) {
    if (body.avatarUrl !== null && typeof body.avatarUrl !== "string") return NextResponse.json({ error: "Foto profil tidak valid." }, { status: 400 });
    const previous = await context.admin!.from("profiles").select("avatar_url").eq("id", id).maybeSingle();
    if (previous.error) return NextResponse.json({ error: "Foto profil gagal diverifikasi." }, { status: 500 });
    if (body.avatarUrl && body.avatarUrl !== previous.data?.avatar_url && !isManagedAvatarUrl(body.avatarUrl, process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "", workspaceId, id)) return NextResponse.json({ error: "Gunakan foto yang diunggah melalui Manajemen User." }, { status: 400 });
    input.avatarUrl = body.avatarUrl;
  }
  const result = await context.admin!.rpc("manage_workspace_user", { p_workspace_id: workspaceId, p_actor_id: context.user!.id, p_user_id: id, p_input: input });
  if (result.error) return NextResponse.json({ error: result.error.code === "PGRST202" ? "Migrasi manajemen user belum tersedia di database." : result.error.message }, { status: result.error.code === "42501" ? 403 : 400 });
  return NextResponse.json({ user: result.data });
}
