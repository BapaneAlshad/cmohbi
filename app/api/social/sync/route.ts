import { NextRequest, NextResponse } from "next/server";
import { connectorHealth, productionDataMode } from "@/lib/social/connectors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncConfiguredSocialData } from "@/lib/social/sync";
import { authenticatedUserId } from "@/lib/social/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const connectors = connectorHealth();
  const configured = connectors.filter((connector) => connector.configured).map((connector) => connector.platform);

  if (!productionDataMode() || configured.length === 0) {
    return NextResponse.json({
      mode: "demo",
      synced: ["instagram", "facebook", "threads", "tiktok"],
      message: "Mode demo aktif. Tambahkan kredensial server dan Supabase untuk sinkronisasi live.",
    });
  }

  const admin = createSupabaseAdminClient();
  const userId = await authenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Sesi login diperlukan untuk sinkronisasi." }, { status: 401 });
  let workspaceId = process.env.SOCIAL_DEFAULT_WORKSPACE_ID;
  if (!workspaceId && admin) {
    const membership = await admin.from("workspace_members").select("workspace_id").eq("user_id", userId).limit(1).maybeSingle();
    workspaceId = membership.data?.workspace_id;
  }
  if (!workspaceId || !admin) return NextResponse.json({ mode: "queued", synced: configured, message: "Credential tersedia, tetapi SOCIAL_DEFAULT_WORKSPACE_ID atau Supabase admin belum dikonfigurasi." }, { status: 202 });
  const results = await syncConfiguredSocialData(workspaceId, admin);
  const succeeded = results.filter((result) => result.ok).length;
  const failed = results.length - succeeded;
  if (!succeeded && failed) {
    return NextResponse.json({
      mode: "failed",
      synced: [],
      failed,
      results,
      error: "Semua konektor provider gagal disinkronkan. Periksa credential, permission, dan hasil tiap provider.",
    }, { status: 502 });
  }
  return NextResponse.json({
    mode: failed ? "partial" : "synced",
    synced: results.filter((result) => result.ok).map((result) => result.platform),
    succeeded,
    failed,
    results,
    message: failed ? `${succeeded} konektor berhasil dan ${failed} gagal disinkronkan.` : `Sinkronisasi ${configured.join(", ")} selesai.`,
  });
}
