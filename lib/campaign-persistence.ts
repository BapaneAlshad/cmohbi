import type { Campaign, CampaignContentConfig, CampaignSavePatch } from "./types.ts";

export const emptyCampaignContent = (): CampaignContentConfig => ({ tagline: "", bigMessage: "", intro: "", instructions: "", instructionsPinned: false, instructionsPinnedAt: null, steps: [], promos: [] });

export function campaignDatabasePatch(patch: CampaignSavePatch) {
  const keys = { name: "name", brandId: "brand_id", objective: "objective", startDate: "start_date", endDate: "end_date", avatarUrl: "avatar_url", contentConfig: "content_config", memberIds: "member_ids", budget: "budget" } as const;
  return Object.fromEntries(Object.entries(patch).map(([key, value]) => [keys[key as keyof typeof keys] || key, value]));
}

export function campaignVersionError(expected: number, actual: number) {
  return expected !== actual ? "Campaign sudah diubah dari perangkat lain. Tutup form dan buka kembali untuk memakai data terbaru; isian Anda belum disimpan." : null;
}

export function storedCampaign(row: Record<string, unknown>, previous: Campaign): Campaign {
  return { ...previous, name: String(row.name), brand: String(row.brand), brandId: row.brand_id as string | null, objective: String(row.objective || ""), startDate: row.start_date as string | null, endDate: row.end_date as string | null, avatarUrl: row.avatar_url as string | null, status: String(row.status), budget: Number(row.budget), spent: Number(row.spent), rowVersion: Number(row.row_version), contentConfig: (row.content_config || emptyCampaignContent()) as CampaignContentConfig, timelineConfig: row.timeline_config as Campaign["timelineConfig"], lifecycleStatus: (row.lifecycle_status || "active") as Campaign["lifecycleStatus"] };
}
