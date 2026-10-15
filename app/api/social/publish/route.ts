import { NextRequest, NextResponse } from "next/server";
import type { SocialPlatform } from "@/lib/types";
import { publishToPlatform, type PublishMediaType } from "@/lib/social/publishers";
import { authenticatedUserId } from "@/lib/social/auth";
import { productionDataMode } from "@/lib/social/connectors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const supported: SocialPlatform[] = ["instagram", "facebook", "threads", "tiktok"];

export async function POST(request: NextRequest) {
  const userId = productionDataMode() ? await authenticatedUserId(request) : null;
  if (productionDataMode() && !userId) return NextResponse.json({ error: "Sesi login diperlukan untuk publish." }, { status: 401 });
  const body = await request.json().catch(() => null) as { workspaceId?: unknown; platforms?: unknown; caption?: unknown; mediaUrl?: unknown; mediaType?: unknown } | null;
  if (productionDataMode()) {
    const workspaceId = String(body?.workspaceId || "");
    const admin = createSupabaseAdminClient();
    if (!workspaceId || !admin || !userId) return NextResponse.json({ error: "Workspace publish tidak valid." }, { status: 400 });
    const membership = await admin.from("workspace_members").select("workspace_id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
    if (membership.error) return NextResponse.json({ error: membership.error.message }, { status: 500 });
    if (!membership.data) return NextResponse.json({ error: "Anda bukan anggota workspace ini." }, { status: 403 });
  }
  const platforms = Array.isArray(body?.platforms) ? body.platforms.filter((item): item is SocialPlatform => typeof item === "string" && supported.includes(item as SocialPlatform)) : [];
  const caption = String(body?.caption || "").trim();
  const mediaUrl = String(body?.mediaUrl || "").trim() || undefined;
  const mediaType = String(body?.mediaType || "feed") as PublishMediaType;
  if (!platforms.length) return NextResponse.json({ error: "Pilih minimal satu platform." }, { status: 400 });
  if (!caption) return NextResponse.json({ error: "Caption wajib diisi." }, { status: 400 });
  if (!["feed", "reel", "video"].includes(mediaType)) return NextResponse.json({ error: "Format media tidak valid." }, { status: 400 });

  const results = await Promise.all(platforms.map((platform) => publishToPlatform({ platform, caption, mediaUrl, mediaType })));
  const ok = results.some((result) => result.ok);
  return NextResponse.json({ results }, { status: ok ? 200 : 502 });
}
