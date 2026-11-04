import type { InfluencerProfileInput, InfluencerCollaborationType, InfluencerAccountPlatform } from "./types";

export const influencerNiches = [
  "Food & Beverage", "Travel", "Media", "Lifestyle", "Beauty/Fashion",
  "Parenting/Family", "Entertainment", "Komunitas/Lokal", "Lainnya",
] as const;

export const influencerAccountPlatforms: InfluencerAccountPlatform[] = ["Instagram", "TikTok"];
export const influencerCollaborationTypes: InfluencerCollaborationType[] = ["Influencer", "Barter Endorse"];
export const influencerRateCardPresets = ["Paid Post", "Visit Instagram", "Visit TikTok", "Mirroring", "Lainnya"] as const;

export function legacyInfluencerNiches(value: string | null | undefined) {
  const normalized = String(value || "").toLowerCase();
  const matched = influencerNiches.filter((niche) => {
    if (niche === "Food & Beverage") return /(food|kuliner|makan|beverage|resto)/.test(normalized);
    if (niche === "Travel") return /(travel|traveler|wisata|jalan.?jalan)/.test(normalized);
    if (niche === "Media") return /(media|publisher|portal|news)/.test(normalized);
    if (niche === "Lifestyle") return /lifestyle/.test(normalized);
    if (niche === "Beauty/Fashion") return /(beauty|fashion|make.?up|skincare)/.test(normalized);
    if (niche === "Parenting/Family") return /(parent|family|keluarga|mom|kids)/.test(normalized);
    if (niche === "Entertainment") return /(entertainment|hiburan|music|film)/.test(normalized);
    if (niche === "Komunitas/Lokal") return /(komunitas|community|local|lokal)/.test(normalized);
    return false;
  });
  return matched.length ? matched : normalized && normalized !== "belum diisi" ? ["Lainnya"] : [];
}

export function normalizeInfluencerUsername(value: string) {
  return value.trim().replace(/^@+/, "");
}

export function normalizeWhatsAppNumber(value: string) {
  const digits = value.trim().replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0")) return `+62${digits.slice(1)}`;
  if (digits.startsWith("8") && digits.length <= 13) return `+62${digits}`;
  return `+${digits}`;
}

export function influencerWhatsAppUrl(value: string) {
  const digits = normalizeWhatsAppNumber(value).replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

export function influencerProfileError(input: InfluencerProfileInput): string | null {
  if (!input.name.trim() || input.name.trim().length > 160) return "Nama influencer wajib diisi (maksimal 160 karakter).";
  const whatsapp = input.whatsapp.trim();
  if (whatsapp) {
    const normalized = normalizeWhatsAppNumber(whatsapp);
    if (!/^\+?[0-9][0-9(). -]*$/.test(whatsapp) || !/^\+[1-9][0-9]{7,14}$/.test(normalized)) {
      return "Nomor WhatsApp tidak valid. Masukkan 8–15 digit, misalnya +62 812 3456 7890.";
    }
  }
  if (!influencerCollaborationTypes.includes(input.collaborationType)) return "Jenis influencer tidak valid.";
  if (!Array.isArray(input.niches) || input.niches.length === 0 || input.niches.some((item) => !influencerNiches.includes(item as (typeof influencerNiches)[number]))) {
    return "Pilih minimal satu niche yang tersedia.";
  }
  if (input.niches.includes("Lainnya") && !input.customNiche.trim()) return "Isi niche lainnya.";
  if (input.customNiche.length > 80) return "Niche lainnya maksimal 80 karakter.";
  const activeAccounts = input.accounts.filter((account) => normalizeInfluencerUsername(account.username || "") || account.followers > 0);
  if (activeAccounts.length === 0) return "Tambahkan minimal satu akun Instagram atau TikTok.";
  if (activeAccounts.some((account) => !influencerAccountPlatforms.includes(account.platform) || !normalizeInfluencerUsername(account.username || ""))) {
    return "Setiap akun yang diisi harus memiliki username Instagram atau TikTok.";
  }
  if (activeAccounts.some((account) => !Number.isSafeInteger(account.followers) || account.followers < 0)) return "Jumlah followers harus berupa angka nol atau lebih.";
  if (new Set(activeAccounts.map((account) => account.platform)).size !== activeAccounts.length) return "Setiap influencer hanya dapat memiliki satu akun per platform.";
  if (activeAccounts.some((account) => normalizeInfluencerUsername(account.username || "").length > 80)) return "Username maksimal 80 karakter.";
  if (!Array.isArray(input.rateCards) || input.rateCards.length === 0 || input.rateCards.length > 30) return "Tambahkan minimal satu paket rate card (maksimal 30 paket).";
  if (input.rateCards.some((card) => card.platform !== "Lainnya" && !activeAccounts.some((account) => account.platform === card.platform))) return "Tambahkan akun sosial untuk setiap platform yang digunakan oleh paket.";
  if (input.rateCards.some((card) => !card.name.trim() || card.name.trim().length > 100)) return "Nama setiap paket wajib diisi (maksimal 100 karakter).";
  if (input.rateCards.some((card) => ![...influencerAccountPlatforms, "Lainnya"].includes(card.platform))) return "Platform paket tidak valid.";
  if (input.rateCards.some((card) => !Number.isSafeInteger(card.amount) || card.amount < 0 || card.amount > 999_999_999_999)) return "Nilai paket harus berupa angka nol atau lebih.";
  if (input.rateCards.some((card) => card.details.length > 2000)) return "Detail deliverable maksimal 2.000 karakter.";
  if (new Set(input.rateCards.map((card) => card.id).filter(Boolean).map(String)).size !== input.rateCards.filter((card) => card.id).length) return "Paket rate card mengandung ID duplikat.";
  return null;
}

export function influencerProfileLegacyFields(input: InfluencerProfileInput) {
  const account = input.accounts.find((item) => normalizeInfluencerUsername(item.username || "")) || input.accounts[0];
  const packageValues = input.rateCards.map((item) => item.amount);
  return {
    platform: account?.platform || "Instagram",
    niche: [...input.niches.filter((item) => item !== "Lainnya"), ...(input.niches.includes("Lainnya") && input.customNiche.trim() ? [input.customNiche.trim()] : [])].join(", ") || "Belum diisi",
    rate: input.collaborationType === "Influencer" ? Math.min(...packageValues) : 0,
    followers: account ? String(account.followers) : "—",
  } as const;
}

export function influencerAccountUrl(platform: string, username: string) {
  const handle = normalizeInfluencerUsername(username);
  if (!handle) return null;
  return platform === "Instagram" ? `https://www.instagram.com/${encodeURIComponent(handle)}/`
    : platform === "TikTok" ? `https://www.tiktok.com/@${encodeURIComponent(handle)}` : null;
}

export function compactFollowerCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (value >= 1_000) return `${(value / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} rb`;
  return new Intl.NumberFormat("id-ID").format(value);
}
