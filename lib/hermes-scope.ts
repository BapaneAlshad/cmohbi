const MARKETING_TERMS = [
  "marketing", "campaign", "kampanye", "brand", "branding", "konten", "content",
  "sosial media", "social media", "instagram", "tiktok", "facebook", "reels", "caption",
  "copywriting", "promosi", "promo", "diskon", "iklan", "ads", "reach", "engagement",
  "impression", "follower", "audience", "target pasar", "pelanggan", "customer", "penjualan",
  "omzet", "omset", "outlet", "influencer", "kol", "creator", "kreator", "kpi", "brief",
  "menu", "produk", "kalender konten", "posting", "publish", "views", "task", "tugas",
  "todo", "to-do", "opening", "f&b", "barista",
  "hbi", "javacafe", "java tea", "new story", "ruma kopi", "ngapaya",
];

const FINANCIAL_TERMS = [
  "keuangan", "finansial", "pengeluaran", "pemasukan", "transaksi", "laba", "rugi", "profit",
  "margin", "budget", "anggaran", "biaya", "hpp", "cost", "spend", "spending", "kas", "saldo",
];

function normalized(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("id-ID");
}

function includesAny(text: string, terms: string[]) {
  const normalizedText = normalized(text);
  return terms.some((term) => normalizedText.includes(term));
}

export function isMarketingScopedPrompt(prompt: string, recentUserMessages: string[] = []) {
  if (includesAny(prompt, MARKETING_TERMS)) return true;
  return recentUserMessages.slice(-4).some((message) => includesAny(message, MARKETING_TERMS));
}

export function requiresFinancialAccess(prompt: string, role: string, recentUserMessages: string[] = []) {
  if (role === "owner" || role === "admin") return false;
  return includesAny(prompt, FINANCIAL_TERMS)
    || recentUserMessages.slice(-3).some((message) => includesAny(message, FINANCIAL_TERMS));
}
