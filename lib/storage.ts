import { demoData } from "./demo-data";
import type { AppData } from "./types";

const STORAGE_KEY = "ngapaya-data-v2";

export function loadLocalData(): AppData {
  if (typeof window === "undefined") return structuredClone(demoData);
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(demoData);
    const parsed = JSON.parse(saved) as Partial<AppData>;
    const merged = { ...structuredClone(demoData), ...parsed } as AppData;
    return { ...merged, brands: (merged.brands || demoData.brands).map((brand) => ({ ...brand, menus: brand.menus || [] })), campaigns: merged.campaigns.map((campaign) => {
      const fallbackCampaign = demoData.campaigns.find((item) => String(item.id) === String(campaign.id));
      return {
        ...campaign,
        objective: campaign.objective || "",
        startDate: campaign.startDate ?? fallbackCampaign?.startDate ?? null,
        endDate: campaign.endDate ?? fallbackCampaign?.endDate ?? null,
        lifecycleStatus: campaign.lifecycleStatus || "active",
      };
    }) };
  } catch {
    return structuredClone(demoData);
  }
}

export function saveLocalData(data: AppData) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function resetLocalData(): AppData {
  const next = structuredClone(demoData);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
