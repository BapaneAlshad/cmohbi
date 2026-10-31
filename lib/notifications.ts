import type { AppData, EntityId, NotificationItem, Task, UserIdentity } from "./types";

export const LOCAL_NOTIFICATIONS_KEY = "ngapaya-notifications-v1";

function sameId(left: EntityId | null | undefined, right: EntityId | null | undefined) {
  return left != null && right != null && String(left) === String(right);
}

function identityNames(identity: UserIdentity) {
  return new Set([identity.name, identity.username].map((value) => value.trim().toLowerCase()).filter(Boolean));
}

export function taskInvolvesUser(task: Pick<Task, "assigneeIds" | "pic">, identity: UserIdentity) {
  const userId = identity.id == null ? null : String(identity.id);
  if (task.assigneeIds?.some((id) => String(id) === userId || String(id) === identity.username)) return true;
  const names = identityNames(identity);
  return task.pic.split(",").some((value) => names.has(value.trim().toLowerCase()));
}

function taskChanged(previous: Task, next: Task) {
  return ["title", "brand", "brandId", "due", "dueDate", "status", "campaign", "priority", "isPriority", "contentCalendarType", "pic"]
    .some((field) => JSON.stringify(previous[field as keyof Task]) !== JSON.stringify(next[field as keyof Task]))
    || JSON.stringify(previous.assigneeIds || []) !== JSON.stringify(next.assigneeIds || []);
}

function campaignChanged(previous: AppData["campaigns"][number], next: AppData["campaigns"][number]) {
  return ["name", "brand", "brandId", "objective", "status", "startDate", "endDate", "lifecycleStatus"]
    .some((field) => JSON.stringify(previous[field as keyof typeof previous]) !== JSON.stringify(next[field as keyof typeof next]));
}

function campaignName(data: AppData, id: EntityId | null | undefined) {
  return data.campaigns.find((campaign) => sameId(campaign.id, id))?.name || "Campaign";
}

export function deriveNotifications(previous: AppData, next: AppData, identity: UserIdentity, createdAt = new Date().toISOString()): NotificationItem[] {
  const previousTasks = new Map(previous.tasks.map((task) => [String(task.id), task]));
  const previousCampaigns = new Map(previous.campaigns.map((campaign) => [String(campaign.id), campaign]));
  const result: NotificationItem[] = [];
  let sequence = 0;
  const add = (item: Omit<NotificationItem, "id" | "createdAt" | "readAt">) => result.push({ ...item, id: `${createdAt}:${sequence++}:${item.kind}:${String(item.taskId || item.campaignId || "workspace")}`, createdAt, readAt: null });

  for (const task of next.tasks) {
    const previousTask = previousTasks.get(String(task.id));
    const involvedNow = taskInvolvesUser(task, identity);
    if (!previousTask && involvedNow) {
      add({ kind: "task_created", title: "Tugas baru untuk Anda", body: `${task.title} · ${campaignName(next, task.campaign)}`, taskId: task.id, campaignId: task.campaign, target: "todo" });
      continue;
    }
    if (!previousTask || !taskChanged(previousTask, task)) continue;
    const involvedBefore = taskInvolvesUser(previousTask, identity);
    if (!involvedBefore && !involvedNow) continue;
    const statusChanged = previousTask.status !== task.status;
    add({ kind: "task_changed", title: statusChanged ? "Status tugas berubah" : "Tugas diperbarui", body: statusChanged ? `${task.title} · ${previousTask.status} → ${task.status}` : `${task.title} · ${campaignName(next, task.campaign)}`, taskId: task.id, campaignId: task.campaign, target: "todo" });
  }

  for (const campaign of next.campaigns) {
    const previousCampaign = previousCampaigns.get(String(campaign.id));
    const related = next.tasks.some((task) => sameId(task.campaign, campaign.id) && taskInvolvesUser(task, identity)) || previous.tasks.some((task) => sameId(task.campaign, campaign.id) && taskInvolvesUser(task, identity));
    if (related && (!previousCampaign || campaignChanged(previousCampaign, campaign))) {
      add({ kind: "campaign_changed", title: previousCampaign ? "Campaign diperbarui" : "Campaign baru", body: `${campaign.name} · ${campaign.brand}`, campaignId: campaign.id, target: "campaigns" });
    }
  }
  return result;
}

export function unreadNotifications(notifications: NotificationItem[]) {
  return notifications.filter((notification) => !notification.readAt);
}

export function loadLocalNotifications(): NotificationItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(LOCAL_NOTIFICATIONS_KEY) || "[]") as NotificationItem[]; } catch { return []; }
}

export function saveLocalNotifications(notifications: NotificationItem[]) {
  if (typeof window !== "undefined") window.localStorage.setItem(LOCAL_NOTIFICATIONS_KEY, JSON.stringify(notifications.slice(0, 100)));
}
