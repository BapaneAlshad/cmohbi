import { NextRequest, NextResponse } from "next/server";
import { isValidPin, isValidUsername, normalizeUsername } from "@/lib/auth-identity";
import { requireUserManager } from "@/lib/supabase/user-admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const workspaceId = String(body?.workspaceId || "");
  const context = await requireUserManager(request, workspaceId);
  if (context.error) return context.error;
  const admin = context.admin!;
  const username = normalizeUsername(String(body?.username ?? ""));
  const pin = String(body?.pin ?? "");
  if (!isValidUsername(username)) return NextResponse.json({ error: "Username tidak valid." }, { status: 400 });
  if (!isValidPin(pin)) return NextResponse.json({ error: "PIN harus terdiri dari 6 angka." }, { status: 400 });

  const target = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (target.error) return NextResponse.json({ error: target.error.message }, { status: 500 });
  if (!target.data) return NextResponse.json({ error: "Username tidak ditemukan." }, { status: 404 });
  const membership = await admin.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("user_id", target.data.id).maybeSingle();
  if (membership.error || !membership.data) return NextResponse.json({ error: "User tidak ditemukan dalam workspace ini." }, { status: 404 });

  const { error: updateError } = await admin.auth.admin.updateUserById(target.data.id, { password: pin });
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ message: `PIN untuk ${username} berhasil direset.` });
}
