import type { SocialPlatform } from "@/lib/types";

export interface ConnectorHealth {
  platform: SocialPlatform;
  configured: boolean;
  accountId?: string;
  message: string;
}

export function connectorHealth(): ConnectorHealth[] {
  const metaToken = Boolean(process.env.META_ACCESS_TOKEN);
  return [
    {
      platform: "instagram",
      configured: metaToken && Boolean(process.env.META_INSTAGRAM_ACCOUNT_ID),
      accountId: process.env.META_INSTAGRAM_ACCOUNT_ID,
      message: metaToken && process.env.META_INSTAGRAM_ACCOUNT_ID ? "Meta Graph siap digunakan" : "Isi META_ACCESS_TOKEN dan META_INSTAGRAM_ACCOUNT_ID",
    },
    {
      platform: "facebook",
      configured: metaToken && Boolean(process.env.META_FACEBOOK_PAGE_ID),
      accountId: process.env.META_FACEBOOK_PAGE_ID,
      message: metaToken && process.env.META_FACEBOOK_PAGE_ID ? "Meta Graph siap digunakan" : "Isi META_ACCESS_TOKEN dan META_FACEBOOK_PAGE_ID",
    },
    {
      platform: "tiktok",
      configured: Boolean(process.env.TIKTOK_ACCESS_TOKEN && process.env.TIKTOK_ADVERTISER_ID),
      accountId: process.env.TIKTOK_ADVERTISER_ID,
      message: process.env.TIKTOK_ACCESS_TOKEN && process.env.TIKTOK_ADVERTISER_ID ? "TikTok Business API siap digunakan" : "Isi TIKTOK_ACCESS_TOKEN dan TIKTOK_ADVERTISER_ID",
    },
  ];
}

export function productionDataMode() {
  return Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
      && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}
