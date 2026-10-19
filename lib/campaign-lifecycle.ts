export type CampaignLifecycleValue = "active" | "archived" | "trashed";
export type CampaignLifecycleAction = "archive" | "unarchive" | "trash" | "restore";

export function nextCampaignLifecycle(
  current: CampaignLifecycleValue,
  previous: CampaignLifecycleValue | null | undefined,
  action: CampaignLifecycleAction,
): CampaignLifecycleValue {
  if (action === "archive" && current === "active") return "archived";
  if (action === "unarchive" && current === "archived") return "active";
  if (action === "trash" && (current === "active" || current === "archived")) return "trashed";
  if (action === "restore" && current === "trashed") return previous === "archived" ? "archived" : "active";
  throw new Error(`Transisi ${current} → ${action} tidak diizinkan.`);
}
