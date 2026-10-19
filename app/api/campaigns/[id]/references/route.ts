import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const referenceKinds = new Set(["Link", "Gambar", "Dokumen"]);

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function referenceContext(request: NextRequest, id: string) {
  const admin = createSupabaseAdminClient();
  const token = bearerToken(request);
  if (!admin) return { response: NextResponse.json({ error: "Konfigurasi Supabase server belum lengkap." }, { status: 503 }) };
  if (!token) return { response: NextResponse.json({ error: "Sesi login tidak ditemukan." }, { status: 401 }) };
  if (!isUuid(id)) return { response: NextResponse.json({ error: "ID campaign tidak valid." }, { status: 400 }) };

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return { response: NextResponse.json({ error: "Sesi login tidak valid atau sudah berakhir." }, { status: 401 }) };

  const campaignResult = await admin.from("campaigns").select("id, workspace_id").eq("id", id).maybeSingle();
  if (campaignResult.error) return { response: NextResponse.json({ error: campaignResult.error.message }, { status: 500 }) };
  if (!campaignResult.data) return { response: NextResponse.json({ error: "Campaign tidak ditemukan." }, { status: 404 }) };

  const membership = await admin.from("workspace_members").select("role").eq("workspace_id", campaignResult.data.workspace_id).eq("user_id", authData.user.id).maybeSingle();
  if (membership.error) return { response: NextResponse.json({ error: membership.error.message }, { status: 500 }) };
  if (!membership.data) return { response: NextResponse.json({ error: "Akses ke workspace tidak diizinkan." }, { status: 403 }) };

  return { admin, user: authData.user, campaign: campaignResult.data, role: membership.data.role };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await referenceContext(request, id);
  if ("response" in context) return context.response;

  const result = await context.admin.from("campaign_references")
    .select("id, title, url, kind, start_date, end_date, mime_type, created_at, created_by")
    .eq("campaign_id", id)
    .eq("workspace_id", context.campaign.workspace_id)
    .order("created_at", { ascending: false });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ references: result.data || [] });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await referenceContext(request, id);
  if ("response" in context) return context.response;
  if (context.role === "viewer") return NextResponse.json({ error: "Akun Viewer tidak dapat menambahkan referensi." }, { status: 403 });

  const body = await request.json().catch(() => null) as { title?: string; url?: string; kind?: string; startDate?: string; endDate?: string; mimeType?: string } | null;
  const title = String(body?.title || "").trim();
  const url = String(body?.url || "").trim();
  const kind = String(body?.kind || "Link").trim();
  const startDate = String(body?.startDate || "").trim();
  const endDate = String(body?.endDate || "").trim();
  const mimeType = String(body?.mimeType || "").trim() || null;
  if (!title || title.length > 160) return NextResponse.json({ error: "Judul referensi wajib diisi dan maksimal 160 karakter." }, { status: 400 });
  if (!validUrl(url) || url.length > 2048) return NextResponse.json({ error: "URL referensi harus berupa URL http atau https yang valid." }, { status: 400 });
  if (!referenceKinds.has(kind)) return NextResponse.json({ error: "Jenis referensi tidak valid." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) return NextResponse.json({ error: "Periode referensi tidak valid." }, { status: 400 });
  if (kind === "Gambar" && mimeType && !mimeType.startsWith("image/")) return NextResponse.json({ error: "Tipe file gambar tidak valid." }, { status: 400 });

  const result = await context.admin.from("campaign_references").insert({
    workspace_id: context.campaign.workspace_id,
    campaign_id: id,
    title,
    url,
    kind,
    start_date: startDate,
    end_date: endDate,
    mime_type: mimeType,
    created_by: context.user.id,
  }).select("id, title, url, kind, start_date, end_date, mime_type, created_at, created_by").single();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ reference: result.data }, { status: 201 });
}
