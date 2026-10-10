import { demoData } from "./demo-data";
import type { AppData } from "./types";

const STORAGE_KEY = "ngapaya-data-v2";

export function loadLocalData(): AppData {
  if (typeof window === "undefined") return structuredClone(demoData);
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(demoData);
    const parsed = JSON.parse(saved) as Partial<AppData>;
    return { ...structuredClone(demoData), ...parsed };
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
