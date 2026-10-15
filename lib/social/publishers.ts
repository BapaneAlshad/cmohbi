import type { SocialPlatform } from "@/lib/types";

export type PublishMediaType = "feed" | "reel" | "video";

export interface PublishInput {
  platform: SocialPlatform;
  caption: string;
  mediaUrl?: string;
  mediaType?: PublishMediaType;
}

export interface PublishResult {
  platform: SocialPlatform;
  ok: boolean;
  externalId?: string;
  message: string;
}

type JsonRecord = Record<string, unknown>;

async function requestJson(url: string, options: RequestInit): Promise<JsonRecord> {
  const response = await fetch(url, { ...options, cache: "no-store" });
  const body = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok || (body.error && typeof body.error === "object")) {
    const error = body.error as JsonRecord | undefined;
    throw new Error(String(error?.message || body.message || `Provider mengembalikan HTTP ${response.status}.`));
  }
  return body;
}

async function waitForVideoContainer(url: string, token: string, containerId: string) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const status = await requestJson(`${url}/${containerId}?fields=status_code,status,error_message&access_token=${encodeURIComponent(token)}`, { method: "GET" });
    const code = String(status.status_code || status.status || "").toUpperCase();
    if (!code || code === "FINISHED" || code === "READY") return;
    if (["ERROR", "EXPIRED", "FAILED"].includes(code)) throw new Error(String(status.error_message || `Pemrosesan video provider gagal (${code}).`));
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Provider belum menyelesaikan pemrosesan video dalam batas waktu publikasi.");
}

function formBody(values: Record<string, string | undefined>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== "") body.set(key, value);
  return body;
}

async function publishInstagram(input: PublishInput): Promise<string> {
  const token = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_INSTAGRAM_ACCOUNT_ID;
  if (!token || !accountId) throw new Error("META_ACCESS_TOKEN dan META_INSTAGRAM_ACCOUNT_ID belum dikonfigurasi.");
  if (!input.mediaUrl) throw new Error("Instagram memerlukan URL media publik.");

  const version = process.env.META_GRAPH_API_VERSION || "v22.0";
  const mediaType = input.mediaType === "reel" || input.mediaType === "video" ? "REELS" : "IMAGE";
  const creation = await requestJson(`https://graph.facebook.com/${version}/${accountId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({ access_token: token, caption: input.caption, media_type: mediaType, image_url: mediaType === "IMAGE" ? input.mediaUrl : undefined, video_url: mediaType === "REELS" ? input.mediaUrl : undefined }),
  });
  const creationId = String(creation.id || "");
  if (!creationId) throw new Error("Instagram tidak mengembalikan container ID.");
  if (mediaType === "REELS") await waitForVideoContainer(`https://graph.facebook.com/${version}`, token, creationId);
  const published = await requestJson(`https://graph.facebook.com/${version}/${accountId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({ access_token: token, creation_id: creationId }),
  });
  return String(published.id || creationId);
}

async function publishFacebook(input: PublishInput): Promise<string> {
  const token = process.env.META_ACCESS_TOKEN;
  const pageId = process.env.META_FACEBOOK_PAGE_ID;
  if (!token || !pageId) throw new Error("META_ACCESS_TOKEN dan META_FACEBOOK_PAGE_ID belum dikonfigurasi.");
  const version = process.env.META_GRAPH_API_VERSION || "v22.0";
  const endpoint = input.mediaType === "video" ? "videos" : input.mediaUrl ? "photos" : "feed";
  const published = await requestJson(`https://graph.facebook.com/${version}/${pageId}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({ access_token: token, message: input.caption, caption: input.caption, description: input.caption, file_url: input.mediaType === "video" ? input.mediaUrl : undefined, url: input.mediaType !== "video" ? input.mediaUrl : undefined }),
  });
  const id = String(published.id || published.post_id || "");
  if (!id) throw new Error("Facebook tidak mengembalikan post ID.");
  return id;
}

async function publishThreads(input: PublishInput): Promise<string> {
  const token = process.env.THREADS_ACCESS_TOKEN;
  const userId = process.env.THREADS_USER_ID;
  if (!token || !userId) throw new Error("THREADS_ACCESS_TOKEN dan THREADS_USER_ID belum dikonfigurasi.");
  const version = process.env.THREADS_API_VERSION || "v1.0";
  const mediaType = input.mediaType === "video" || input.mediaType === "reel" ? "VIDEO" : input.mediaType === "feed" && input.mediaUrl ? "IMAGE" : "TEXT";
  const creation = await requestJson(`https://graph.threads.net/${version}/${userId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({ access_token: token, text: input.caption, media_type: mediaType, image_url: mediaType === "IMAGE" ? input.mediaUrl : undefined, video_url: mediaType === "VIDEO" ? input.mediaUrl : undefined }),
  });
  const creationId = String(creation.id || "");
  if (!creationId) throw new Error("Threads tidak mengembalikan container ID.");
  if (mediaType === "VIDEO") await waitForVideoContainer(`https://graph.threads.net/${version}`, token, creationId);
  const published = await requestJson(`https://graph.threads.net/${version}/${userId}/threads_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({ access_token: token, creation_id: creationId }),
  });
  return String(published.id || creationId);
}

async function publishTikTok(input: PublishInput): Promise<string> {
  const token = process.env.TIKTOK_PUBLISH_ACCESS_TOKEN || process.env.TIKTOK_ACCESS_TOKEN;
  if (!token) throw new Error("TIKTOK_PUBLISH_ACCESS_TOKEN atau TIKTOK_ACCESS_TOKEN belum dikonfigurasi.");
  if (!input.mediaUrl) throw new Error("TikTok Direct Post memerlukan URL video publik.");
  if (input.mediaType !== "video" && input.mediaType !== "reel") throw new Error("TikTok Direct Post saat ini menerima format video.");
  const baseUrl = process.env.TIKTOK_API_BASE_URL || "https://open.tiktokapis.com";
  const creator = await requestJson(`${baseUrl}/v2/post/publish/creator_info/query/`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
  const privacyOptions = (((creator.data as JsonRecord | undefined)?.privacy_level_options as string[] | undefined) || []);
  const privacyLevel = privacyOptions.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : privacyOptions[0] || "SELF_ONLY";
  const result = await requestJson(`${baseUrl}/v2/post/publish/video/init/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ post_info: { title: input.caption, privacy_level: privacyLevel, disable_comment: false, disable_duet: false, disable_stitch: false }, source_info: { source: "PULL_FROM_URL", video_url: input.mediaUrl } }),
  });
  const publishId = String((result.data as JsonRecord | undefined)?.publish_id || "");
  if (!publishId) throw new Error("TikTok tidak mengembalikan publish ID.");
  return publishId;
}

export async function publishToPlatform(input: PublishInput): Promise<PublishResult> {
  try {
    const externalId = input.platform === "instagram"
      ? await publishInstagram(input)
      : input.platform === "facebook"
        ? await publishFacebook(input)
        : input.platform === "threads"
          ? await publishThreads(input)
          : await publishTikTok(input);
    return { platform: input.platform, ok: true, externalId, message: "Konten berhasil dikirim ke provider." };
  } catch (error) {
    return { platform: input.platform, ok: false, message: error instanceof Error ? error.message : "Provider gagal menerima konten." };
  }
}
