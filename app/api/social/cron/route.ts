import { NextRequest, NextResponse } from "next/server";
import type { SocialPlatform } from "@/lib/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { publishToPlatform, type PublishMediaType } from "@/lib/social/publishers";
import { syncConfiguredSocialData } from "@/lib/social/sync";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET belum dikonfigurasi; worker publish dinonaktifkan." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ processed: 0, message: "Supabase belum dikonfigurasi." });

  const due = await admin.from("social_posts").select("id, social_account_id, title, caption, media_url, media_type, status, scheduled_at").eq("status", "scheduled").lte("scheduled_at", new Date().toISOString()).limit(50);
  if (due.error) return NextResponse.json({ error: due.error.message }, { status: 500 });
  let processed = 0;
  for (const post of due.data || []) {
    const account = await admin.from("social_accounts").select("platform").eq("id", post.social_account_id).maybeSingle();
    const platform = account.data?.platform as SocialPlatform | undefined;
    if (!platform) continue;
    const result = await publishToPlatform({ platform, caption: post.caption || post.title || "", mediaUrl: post.media_url || undefined, mediaType: (post.media_type || "feed") as PublishMediaType });
    await admin.from("social_posts").update({
      status: result.ok ? "published" : "failed",
      provider_status: result.ok ? "published" : "failed",
      external_post_id: result.externalId || null,
      published_at: result.ok ? new Date().toISOString() : null,
      error_message: result.ok ? null : result.message,
    }).eq("id", post.id);
    processed += 1;
  }
  let synced: unknown[] = [];
  const workspaceId = process.env.SOCIAL_DEFAULT_WORKSPACE_ID;
  if (workspaceId) synced = await syncConfiguredSocialData(workspaceId, admin);
  return NextResponse.json({ processed, synced });
}
