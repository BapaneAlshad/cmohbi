import type { Campaign, CampaignInfluencerTheme, EntityId, InfluencerBookingStatus, InfluencerPaymentStatus, UserIdentity } from "./types.ts";

export const influencerBookingStatuses: readonly InfluencerBookingStatus[] = [
  "Menunggu konfirmasi", "Terjadwal", "Sudah visit", "Revisi", "Selesai", "Dibatalkan",
];
export const influencerPaymentStatuses: readonly InfluencerPaymentStatus[] = ["Belum dibayar", "DP dibayar", "Lunas"];

export function isInfluencerBookingStatus(status: unknown): status is InfluencerBookingStatus {
  return typeof status === "string" && influencerBookingStatuses.includes(status as InfluencerBookingStatus);
}

export function displayInfluencerBookingStatus(status: string): string {
  if (status === "Draft") return "Menunggu konfirmasi";
  // Keep older saved records readable until the additive database migration is applied.
  if (status.trim().toLocaleLowerCase("id-ID") === "menunggu upload") return "Sudah visit";
  return status;
}

export function displayInfluencerPaymentStatus(status: string): string {
  const normalized = status.trim().toLocaleLowerCase("id-ID");
  if (normalized === "belum dibayar") return "Belum dibayar";
  if (normalized === "dp dibayar") return "DP dibayar";
  if (normalized === "lunas" || normalized === "sudah dibayar") return "Lunas";
  return status;
}

export function influencerBookingStatusTone(status: string) {
  const normalized = displayInfluencerBookingStatus(status);
  const tones: Record<string, string> = {
    "Menunggu konfirmasi": "awaiting", Terjadwal: "scheduled", "Sudah visit": "visited",
    Revisi: "revision", Selesai: "completed", Dibatalkan: "cancelled",
  };
  return tones[normalized] || "legacy";
}

export function influencerPaymentStatusTone(status: string) {
  const normalized = displayInfluencerPaymentStatus(status);
  const tones: Record<string, string> = { "Belum dibayar": "unpaid", "DP dibayar": "deposit", Lunas: "paid" };
  return tones[normalized] || "legacy";
}

export function calculateInfluencerPaidAmount(status: InfluencerPaymentStatus, rate: number, requestedAmount?: number): { amount?: number; error?: string } {
  const safeRate = Math.max(Number(rate) || 0, 0);
  if (status === "Belum dibayar") return { amount: 0 };
  if (status === "Lunas") return { amount: safeRate };
  const amount = Number(requestedAmount);
  if (!Number.isFinite(amount) || amount <= 0 || amount >= safeRate) return { error: "Nominal DP harus lebih dari Rp0 dan lebih kecil dari rate influencer." };
  return { amount };
}

export function canEditCampaignInfluencers(identity?: UserIdentity, campaign?: Pick<Campaign, "lifecycleStatus">) {
  return Boolean(identity && ["owner", "admin", "member"].includes(identity.accessRole || "") && campaign && (campaign.lifecycleStatus || "active") === "active");
}

export function nextCampaignInfluencerThemeCode(themes: CampaignInfluencerTheme[], campaignId: EntityId) {
  const highest = campaignInfluencerThemesForCampaign(themes, campaignId)
    .reduce((max, theme) => Math.max(max, Number(theme.code.match(/^T(\d+)$/i)?.[1] || 0)), 0);
  return `T${String(highest + 1).padStart(2, "0")}`;
}

export function campaignInfluencerThemesForCampaign(themes: CampaignInfluencerTheme[], campaignId: EntityId) {
  return themes.filter((theme) => String(theme.campaignId) === String(campaignId));
}

export function validateInfluencerScheduleDates(visitDate: string, uploadDate: string) {
  for (const value of [visitDate, uploadDate]) {
    if (!value) continue;
    const date = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "Pilih tanggal visit dan upload yang valid.";
  }
  if (visitDate && uploadDate && uploadDate < visitDate) return "Tanggal upload tidak boleh lebih awal dari tanggal visit.";
  return null;
}
