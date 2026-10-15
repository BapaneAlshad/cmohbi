import type { SocialPlatform } from "@/lib/types";

export interface ConnectorHealth {
  platform: SocialPlatform;
  configured: boolean;
  accountId?: string;
  message: string;
}

export function connectorHealth(): ConnectorHealth[] {
  const metaToken = Boolean(process.env.META_ACCESS_TOKEN);
  const tiktokBusinessId = process.env.TIKTOK_BUSINESS_ID || process.env.TIKTOK_ADVERTISER_ID;
  const tiktokBusinessToken = process.env.TIKTOK_BUSINESS_ACCESS_TOKEN || process.env.TIKTOK_ACCESS_TOKEN;
  const tiktokPublishToken = process.env.TIKTOK_PUBLISH_ACCESS_TOKEN || process.env.TIKTOK_ACCESS_TOKEN;
  return [
    {
      platform: "instagram",
      configured: metaToken && Boolean(process.env.META_INSTAGRAM_ACCOUNT_ID),
      accountId: process.env.META_INSTAGRAM_ACCOUNT_ID,
      message: metaToken && process.env.META_INSTAGRAM_ACCOUNT_ID ? "Credential Meta terdeteksi; jalankan sinkronisasi untuk verifikasi." : "Isi META_ACCESS_TOKEN dan META_INSTAGRAM_ACCOUNT_ID",
    },
    {
      platform: "facebook",
      configured: metaToken && Boolean(process.env.META_FACEBOOK_PAGE_ID),
      accountId: process.env.META_FACEBOOK_PAGE_ID,
      message: metaToken && process.env.META_FACEBOOK_PAGE_ID ? "Credential Meta terdeteksi; jalankan sinkronisasi untuk verifikasi." : "Isi META_ACCESS_TOKEN dan META_FACEBOOK_PAGE_ID",
    },
    {
      platform: "threads",
      configured: Boolean(process.env.THREADS_ACCESS_TOKEN && process.env.THREADS_USER_ID),
      accountId: process.env.THREADS_USER_ID,
      message: process.env.THREADS_ACCESS_TOKEN && process.env.THREADS_USER_ID ? "Credential Threads terdeteksi; jalankan sinkronisasi untuk verifikasi." : "Isi THREADS_ACCESS_TOKEN dan THREADS_USER_ID",
    },
    {
      platform: "tiktok",
      configured: Boolean(tiktokBusinessToken && tiktokBusinessId),
      accountId: tiktokBusinessId,
      message: tiktokBusinessToken && tiktokBusinessId ? `Credential TikTok terdeteksi${tiktokPublishToken ? "; publish dapat diuji" : "; token publish belum dikonfigurasi"}` : "Isi TIKTOK_BUSINESS_ACCESS_TOKEN dan TIKTOK_BUSINESS_ID",
    },
  ];
}

export function productionDataMode() {
  return Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
      && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}
