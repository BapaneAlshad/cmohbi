import type { SocialPlatform } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Json = Record<string, any>;
type Snapshot = { followers: number; reach: number; impressions: number; views: number; engagementRate: number };

async function getJson(url: string, init?: RequestInit): Promise<Json> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json().catch(() => ({})) as Json;
  if (!response.ok || (body.error && typeof body.error === "object")) throw new Error(String(body.error?.message || body.message || `Provider HTTP ${response.status}`));
  return body;
}

async function getCollection(url: string, init?: RequestInit, maxPages = 10): Promise<Json[]> {
  const rows: Json[] = [];
  let nextUrl: string | undefined = url;
  for (let page = 0; nextUrl && page < maxPages; page += 1) {
    const body = await getJson(nextUrl, init);
    if (Array.isArray(body.data)) rows.push(...body.data as Json[]);
    const paging = body.paging as Json | undefined;
    nextUrl = typeof paging?.next === "string" ? paging.next : undefined;
  }
  return rows;
}

function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

function providerTimestamp(value: unknown, fallback = new Date().toISOString()) {
  if (typeof value === "number" || (typeof value === "string" && /^\d{9,13}$/.test(value))) {
    const milliseconds = Number(value) < 10_000_000_000 ? Number(value) * 1000 : Number(value);
    return new Date(milliseconds).toISOString();
  }
  return typeof value === "string" && value ? value : fallback;
}

async function upsertAccount(admin: SupabaseClient, workspaceId: string, platform: SocialPlatform, externalId: string, displayName: string, handle: string, followers: number) {
  const result = await admin.from("social_accounts").upsert({ workspace_id: workspaceId, platform, external_account_id: externalId, display_name: displayName || platform, handle: handle || null, status: "connected", last_sync_at: new Date().toISOString() }, { onConflict: "workspace_id,platform,external_account_id" }).select("id").single();
  if (result.error) throw result.error;
  return result.data.id as string;
}

async function saveSnapshot(admin: SupabaseClient, workspaceId: string, accountId: string, snapshot: Snapshot) {
  const result = await admin.from("social_metric_snapshots").insert({ workspace_id: workspaceId, social_account_id: accountId, captured_at: new Date().toISOString(), ...snapshot });
  if (result.error) throw result.error;
}

async function savePost(admin: SupabaseClient, workspaceId: string, accountId: string, post: { id: string; title: string; publishedAt: string; metrics?: Snapshot }) {
  const existing = await admin.from("social_posts").select("id").eq("social_account_id", accountId).eq("external_post_id", post.id).maybeSingle();
  const payload = { workspace_id: workspaceId, social_account_id: accountId, external_post_id: post.id, title: post.title || "Konten sosial", status: "published", provider_status: "published", published_at: post.publishedAt, metrics: post.metrics || {} };
  const result = existing.data?.id
    ? await admin.from("social_posts").update(payload).eq("id", existing.data.id)
    : await admin.from("social_posts").insert(payload);
  if (result.error) throw result.error;
}

async function saveInbox(admin: SupabaseClient, workspaceId: string, accountId: string, item: { id: string; kind: "comment" | "message"; author: string; body: string; postTitle?: string; occurredAt?: string; platform: SocialPlatform; canReply?: boolean }) {
  if (!item.body) return;
  const result = await admin.from("social_inbox").upsert({ workspace_id: workspaceId, social_account_id: accountId, platform: item.platform, kind: item.kind, external_id: item.id, author: item.author || "Pengguna sosial", body: item.body, post_title: item.postTitle || null, occurred_at: item.occurredAt || new Date().toISOString(), can_reply: item.canReply ?? true, raw_payload: item }, { onConflict: "platform,external_id" });
  if (result.error) throw result.error;
}

function metricValue(payload: Json, name: string) {
  const row = (payload.data as Json[] | undefined)?.find((item) => item.name === name);
  const values = row?.values as Json[] | undefined;
  const latest = values?.at(-1);
  const value = latest?.value;
  if (value && typeof value === "object") return number((value as Json).total_value || (value as Json).value);
  return number(value);
}

async function syncMetaMessages(platform: "instagram" | "facebook", externalId: string, workspaceId: string, accountId: string, token: string, version: string, admin: SupabaseClient) {
  const fields = "participants,messages.limit(100){id,message,text,from,created_time}";
  const url = platform === "instagram"
    ? `https://graph.facebook.com/${version}/${externalId}/conversations?platform=instagram&fields=${encodeURIComponent(fields)}&limit=100&access_token=${encodeURIComponent(token)}`
    : `https://graph.facebook.com/${version}/${externalId}/conversations?fields=${encodeURIComponent(fields)}&limit=100&access_token=${encodeURIComponent(token)}`;
  const conversations = await getCollection(url).catch(() => []);
  let messages = 0;
  for (const conversation of conversations) {
    const nested = conversation.messages as Json | undefined;
    for (const message of (nested?.data || []) as Json[]) {
      const body = String(message.message || message.text || "");
      if (!body || !message.id) continue;
      const from = message.from as Json | undefined;
      await saveInbox(admin, workspaceId, accountId, {
        id: String(message.id),
        platform,
        kind: "message",
        author: String(from?.name || from?.username || from?.id || "Pengguna sosial"),
        body,
        occurredAt: String(message.created_time || new Date().toISOString()),
        canReply: true,
      });
      messages += 1;
    }
  }
  return messages;
}

async function syncMeta(platform: "instagram" | "facebook", workspaceId: string, admin: SupabaseClient) {
  const token = process.env.META_ACCESS_TOKEN;
  const externalId = platform === "instagram" ? process.env.META_INSTAGRAM_ACCOUNT_ID : process.env.META_FACEBOOK_PAGE_ID;
  if (!token || !externalId) throw new Error("Credential Meta belum lengkap.");
  const version = process.env.META_GRAPH_API_VERSION || "v22.0";
  const fields = platform === "instagram" ? "id,username,name,followers_count" : "id,name,username,followers_count,fan_count";
  const profile = await getJson(`https://graph.facebook.com/${version}/${externalId}?fields=${fields}&access_token=${encodeURIComponent(token)}`);
  const followers = number(profile.followers_count || profile.fan_count);
  const accountId = await upsertAccount(admin, workspaceId, platform, externalId, String(profile.name || profile.username || platform), String(profile.username || ""), followers);
  const snapshot: Snapshot = { followers, reach: 0, impressions: 0, views: 0, engagementRate: 0 };
  const insightMetrics = platform === "instagram"
    ? (process.env.META_INSTAGRAM_INSIGHTS_METRICS || "reach,impressions,profile_views")
    : (process.env.META_FACEBOOK_INSIGHTS_METRICS || "page_reach,page_impressions,page_engaged_users");
  const insights = await getJson(`https://graph.facebook.com/${version}/${externalId}/insights?metric=${encodeURIComponent(insightMetrics)}&period=day&access_token=${encodeURIComponent(token)}`).catch(() => ({}));
  snapshot.reach = metricValue(insights, platform === "instagram" ? "reach" : "page_reach");
  snapshot.impressions = metricValue(insights, platform === "instagram" ? "impressions" : "page_impressions");
  snapshot.views = metricValue(insights, platform === "instagram" ? "profile_views" : "page_views_total");
  const engaged = platform === "facebook" ? metricValue(insights, "page_engaged_users") : 0;
  snapshot.engagementRate = snapshot.reach > 0 ? Number(((engaged / snapshot.reach) * 100).toFixed(4)) : 0;
  const mediaUrl = platform === "instagram"
    ? `https://graph.facebook.com/${version}/${externalId}/media?fields=id,caption,timestamp,media_type,like_count,comments_count&limit=25&access_token=${encodeURIComponent(token)}`
    : `https://graph.facebook.com/${version}/${externalId}/feed?fields=id,message,created_time,permalink_url,shares,comments.summary(true),reactions.summary(true)&limit=25&access_token=${encodeURIComponent(token)}`;
  const mediaRows = await getCollection(mediaUrl).catch(() => []);
  for (const item of mediaRows) {
    const title = String(item.caption || item.message || "Konten sosial").slice(0, 140);
    const publishedAt = String(item.timestamp || item.created_time || new Date().toISOString());
    await savePost(admin, workspaceId, accountId, { id: String(item.id), title, publishedAt, metrics: { ...snapshot, engagementRate: number(item.like_count || item.reactions?.summary?.total_count) } });
    const comments = await getCollection(`https://graph.facebook.com/${version}/${item.id}/comments?fields=id,message,text,from,username,created_time&limit=100&access_token=${encodeURIComponent(token)}`).catch(() => []);
    for (const comment of comments) await saveInbox(admin, workspaceId, accountId, { id: String(comment.id), platform, kind: "comment", author: String(comment.from?.name || comment.username || "Pengguna sosial"), body: String(comment.message || comment.text || ""), postTitle: title, occurredAt: String(comment.created_time || publishedAt), canReply: true });
  }
  const messageCount = await syncMetaMessages(platform, externalId, workspaceId, accountId, token, version, admin);
  await saveSnapshot(admin, workspaceId, accountId, snapshot);
  return { platform, accountId, posts: mediaRows.length, messages: messageCount };
}

async function syncThreads(workspaceId: string, admin: SupabaseClient) {
  const token = process.env.THREADS_ACCESS_TOKEN;
  const userId = process.env.THREADS_USER_ID;
  if (!token || !userId) throw new Error("Credential Threads belum lengkap.");
  const version = process.env.THREADS_API_VERSION || "v1.0";
  const profile = await getJson(`https://graph.threads.net/${version}/${userId}?fields=id,username,name&access_token=${encodeURIComponent(token)}`);
  const accountId = await upsertAccount(admin, workspaceId, "threads", userId, String(profile.name || profile.username || "Threads"), String(profile.username || ""), 0);
  const profileInsights = await getJson(`https://graph.threads.net/${version}/${userId}/threads_insights?metric=followers_count&access_token=${encodeURIComponent(token)}`).catch(() => ({}));
  const followers = metricValue(profileInsights, "followers_count");
  const mediaRows = await getCollection(`https://graph.threads.net/${version}/${userId}/threads?fields=id,text,timestamp,username,permalink,views,likes,replies,reposts&limit=100&access_token=${encodeURIComponent(token)}`).catch(() => []);
  for (const item of mediaRows) {
    const title = String(item.text || "Threads post").slice(0, 140);
    const insight = await getJson(`https://graph.threads.net/${version}/${item.id}/insights?metric=views,likes,replies,reposts,quotes&access_token=${encodeURIComponent(token)}`).catch(() => ({}));
    const views = metricValue(insight, "views") || number(item.views);
    const likes = metricValue(insight, "likes") || number(item.likes);
    const repliesCount = metricValue(insight, "replies") || number(item.replies);
    const reposts = metricValue(insight, "reposts") || number(item.reposts);
    await savePost(admin, workspaceId, accountId, { id: String(item.id), title, publishedAt: String(item.timestamp || new Date().toISOString()), metrics: { followers: 0, reach: views, impressions: views, views, engagementRate: views > 0 ? Number((((likes + repliesCount + reposts) / views) * 100).toFixed(4)) : 0 } });
    const replies = await getCollection(`https://graph.threads.net/${version}/${item.id}/replies?fields=id,text,username,timestamp&limit=100&access_token=${encodeURIComponent(token)}`).catch(() => []);
    for (const reply of replies) await saveInbox(admin, workspaceId, accountId, { id: String(reply.id), platform: "threads", kind: "comment", author: String(reply.username || "Pengguna Threads"), body: String(reply.text || ""), postTitle: title, occurredAt: String(reply.timestamp || new Date().toISOString()), canReply: true });
  }
  const totalViews = mediaRows.reduce((sum, item) => sum + number(item.views), 0);
  await saveSnapshot(admin, workspaceId, accountId, { followers, reach: totalViews, impressions: totalViews, views: totalViews, engagementRate: 0 });
  return { platform: "threads" as const, accountId, posts: mediaRows.length };
}

async function syncTikTok(workspaceId: string, admin: SupabaseClient) {
  const token = process.env.TIKTOK_BUSINESS_ACCESS_TOKEN || process.env.TIKTOK_ACCESS_TOKEN;
  const businessId = process.env.TIKTOK_BUSINESS_ID || process.env.TIKTOK_ADVERTISER_ID;
  if (!token || !businessId) throw new Error("TIKTOK_BUSINESS_ACCESS_TOKEN (atau TIKTOK_ACCESS_TOKEN) dan TIKTOK_BUSINESS_ID belum lengkap.");
  const base = process.env.TIKTOK_BUSINESS_API_BASE_URL || "https://business-api.tiktok.com/open_api/v1.3";
  const profile = await getJson(`${base}/business/get/?business_id=${encodeURIComponent(businessId)}`, { headers: { "Access-Token": token } });
  const profileData = profile.data?.business || profile.data || {};
  const accountId = await upsertAccount(admin, workspaceId, "tiktok", businessId, String(profileData.display_name || profileData.username || "TikTok"), String(profileData.username || ""), number(profileData.follower_count));
  const videos = await getJson(`${base}/business/video/list/?business_id=${encodeURIComponent(businessId)}&page_size=20`, { headers: { "Access-Token": token } }).catch(() => ({ data: { videos: [] } }));
  const videoRows = videos.data?.videos || videos.data?.list || [];
  for (const video of videoRows as Json[]) {
    const videoId = String(video.video_id || video.id || "");
    const title = String(video.title || video.description || "TikTok video").slice(0, 140);
    await savePost(admin, workspaceId, accountId, { id: videoId, title, publishedAt: providerTimestamp(video.create_time), metrics: { followers: number(profileData.follower_count), reach: number(video.view_count), impressions: number(video.view_count), views: number(video.view_count), engagementRate: number(video.like_count) } });
    if (!videoId) continue;
    let cursor = "0";
    for (let page = 0; page < 10; page += 1) {
      const comments = await getJson(`${base}/business/comment/list/?business_id=${encodeURIComponent(businessId)}&video_id=${encodeURIComponent(videoId)}&include_replies=true&max_count=30&cursor=${encodeURIComponent(cursor)}`, { headers: { "Access-Token": token } }).catch(() => ({ data: { comments: [], has_more: false } }));
      const commentRows = comments.data?.comments || [];
      for (const comment of commentRows as Json[]) {
        await saveInbox(admin, workspaceId, accountId, { id: String(comment.comment_id || comment.id), platform: "tiktok", kind: "comment", author: String(comment.display_name || comment.username || "Pengguna TikTok"), body: String(comment.text || ""), postTitle: title, occurredAt: providerTimestamp(comment.create_time), canReply: true });
        for (const reply of (comment.reply_list || []) as Json[]) await saveInbox(admin, workspaceId, accountId, { id: String(reply.comment_id || reply.id), platform: "tiktok", kind: "comment", author: String(reply.display_name || reply.username || "Pengguna TikTok"), body: String(reply.text || ""), postTitle: title, occurredAt: providerTimestamp(reply.create_time), canReply: true });
      }
      if (!comments.data?.has_more) break;
      cursor = String(comments.data?.cursor || "");
      if (!cursor) break;
    }
  }
  let messageCount = 0;
  for (const conversationType of ["STRANGER", "SINGLE"]) {
    let cursor = "0";
    for (let page = 0; page < 10; page += 1) {
      const conversations = await getJson(`${base}/business/message/conversation/list/?business_id=${encodeURIComponent(businessId)}&conversation_type=${conversationType}&limit=100&cursor=${encodeURIComponent(cursor)}`, { headers: { "Access-Token": token } }).catch(() => ({ data: { conversations: [], has_more: false } }));
      for (const conversation of (conversations.data?.conversations || []) as Json[]) {
        const conversationId = String(conversation.conversation_id || "");
        if (!conversationId) continue;
        const content = await getJson(`${base}/business/message/content/list/?business_id=${encodeURIComponent(businessId)}&conversation_id=${encodeURIComponent(conversationId)}`, { headers: { "Access-Token": token } }).catch(() => ({ data: { messages: [] } }));
        for (const message of (content.data?.messages || []) as Json[]) {
          const textBody = (message.text as Json | undefined)?.body;
          const body = String(textBody || message.body || `[${String(message.message_type || "Pesan TikTok")}]`);
          const fromUser = message.from_user as Json | undefined;
          await saveInbox(admin, workspaceId, accountId, { id: String(message.message_id || `${conversationId}:${message.timestamp}`), platform: "tiktok", kind: "message", author: String(fromUser?.display_name || fromUser?.username || fromUser?.unique_identifier || message.sender || "Pengguna TikTok"), body, occurredAt: providerTimestamp(message.timestamp), canReply: true });
          messageCount += 1;
        }
      }
      if (!conversations.data?.has_more) break;
      cursor = String(conversations.data?.cursor || "");
      if (!cursor) break;
    }
  }
  const totalViews = (videoRows as Json[]).reduce((sum, video) => sum + number(video.view_count), 0);
  await saveSnapshot(admin, workspaceId, accountId, { followers: number(profileData.follower_count), reach: totalViews, impressions: totalViews, views: totalViews, engagementRate: 0 });
  return { platform: "tiktok" as const, accountId, posts: videoRows.length, messages: messageCount };
}

export async function syncConfiguredSocialData(workspaceId: string, admin: SupabaseClient) {
  const jobs: Array<{ platform: SocialPlatform; promise: Promise<unknown> }> = [];
  if (process.env.META_ACCESS_TOKEN && process.env.META_INSTAGRAM_ACCOUNT_ID) jobs.push({ platform: "instagram", promise: syncMeta("instagram", workspaceId, admin) });
  if (process.env.META_ACCESS_TOKEN && process.env.META_FACEBOOK_PAGE_ID) jobs.push({ platform: "facebook", promise: syncMeta("facebook", workspaceId, admin) });
  if (process.env.THREADS_ACCESS_TOKEN && process.env.THREADS_USER_ID) jobs.push({ platform: "threads", promise: syncThreads(workspaceId, admin) });
  if ((process.env.TIKTOK_BUSINESS_ACCESS_TOKEN || process.env.TIKTOK_ACCESS_TOKEN) && (process.env.TIKTOK_BUSINESS_ID || process.env.TIKTOK_ADVERTISER_ID)) jobs.push({ platform: "tiktok", promise: syncTikTok(workspaceId, admin) });
  const settled = await Promise.allSettled(jobs.map((job) => job.promise));
  return settled.map((item, index) => {
    const platform = jobs[index].platform;
    if (item.status === "rejected") return { ok: false as const, platform, message: item.reason instanceof Error ? item.reason.message : "Sync gagal." };
    const value = item.value;
    return value && typeof value === "object" ? { ok: true as const, platform, ...value } : { ok: true as const, platform, value };
  });
}
