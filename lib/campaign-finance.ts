import type { Campaign, CampaignExpenseCategory, CampaignExpenseInput, UserIdentity } from "./types.ts";

export const campaignExpenseCategories: Record<CampaignExpenseCategory, string> = {
  promo_subsidy: "Subsidi promo",
  ads: "Ads",
  other: "Lainnya",
};

export function canCreateCampaignExpense(identity?: UserIdentity | null, campaign?: Pick<Campaign, "lifecycleStatus"> | null) {
  return Boolean(
    identity
      && ["owner", "admin", "member"].includes(identity.accessRole || "")
      && campaign
      && (campaign.lifecycleStatus || "active") === "active",
  );
}

const MAX_CAMPAIGN_MONEY = 999_999_999_999.99;

function validMoney(value: number) {
  return Number.isFinite(value)
    && value >= 0
    && value <= MAX_CAMPAIGN_MONEY
    && Math.abs(Math.round(value * 100) - value * 100) < 1e-8;
}

export function validateCampaignBudget(value: number) {
  if (!validMoney(value)) return "Budget harus berupa angka Rp0 sampai Rp999.999.999.999,99 dengan maksimal dua angka desimal.";
  return null;
}

export function validateCampaignExpense(input: CampaignExpenseInput) {
  if (!(input.category in campaignExpenseCategories)) return "Kategori pengeluaran tidak valid.";
  if (!input.title.trim() || input.title.trim().length > 160) return "Nama pengeluaran wajib diisi dan maksimal 160 karakter.";
  if (!Number.isFinite(input.amount) || input.amount <= 0 || !validMoney(input.amount)) return "Jumlah pengeluaran harus lebih dari Rp0 dan maksimal Rp999.999.999.999,99.";
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? new Date(`${input.date}T00:00:00Z`) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== input.date) return "Tanggal pengeluaran tidak valid.";
  if ((input.details || "").length > 2000) return "Catatan pengeluaran maksimal 2.000 karakter.";
  return null;
}
