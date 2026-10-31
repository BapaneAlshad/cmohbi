import type { AdminDashboardNote, AppData, CampaignDiscussionNote, EntityId, Task, UserIdentity } from "./types.ts";
import { isTaskManager, taskIsPriority } from "./task-workflow.ts";
import { taskDate } from "./campaign-overview.ts";

const monthNumber: Record<string, number> = { jan: 1, januari: 1, feb: 2, februari: 2, mar: 3, maret: 3, apr: 4, april: 4, mei: 5, jun: 6, juni: 6, jul: 7, juli: 7, agu: 8, agt: 8, agustus: 8, sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, nov: 11, november: 11, des: 12, desember: 12 };

function dashboardTaskDate(task: Task, data: AppData, today: string) {
  const raw = task.dueDate || task.due;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const relative = raw.toLowerCase();
  if (["hari ini", "today"].includes(relative)) return today;
  if (["besok", "tomorrow"].includes(relative)) return shiftDay(today, 1);
  if (relative === "kemarin") return shiftDay(today, -1);
  const match = raw.match(/^(\d{1,2})\s+([a-z]+)\.?\s*(\d{4})?$/i);
  if (!match || !monthNumber[match[2].toLowerCase()]) return taskDate(task);
  const month = monthNumber[match[2].toLowerCase()];
  const campaign = data.campaigns.find((item) => String(item.id) === String(task.campaign));
  const candidateYears = [match[3] ? Number(match[3]) : undefined, campaign?.endDate ? Number(campaign.endDate.slice(0, 4)) : undefined, campaign?.startDate ? Number(campaign.startDate.slice(0, 4)) : undefined, Number(today.slice(0, 4))].filter((year): year is number => Number.isInteger(year));
  const year = candidateYears[0];
  if (!year) return taskDate(task);
  const day = Number(match[1]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : taskDate(task);
}

function shiftDay(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function resolveUserId(data: AppData, identity: UserIdentity) {
  const profile = data.users.find((user) => identity.id != null && String(user.id) === String(identity.id))
    || data.users.find((user) => user.username === identity.username || Boolean(identity.email && user.email === identity.email));
  return identity.id ?? profile?.id ?? profile?.username ?? identity.username;
}

export function taskBelongsToUser(task: Task, data: AppData, identity?: UserIdentity) {
  if (!identity) return false;
  const user = data.users.find((item) => identity.id != null && String(item.id) === String(identity.id))
    || data.users.find((item) => item.username === identity.username || Boolean(identity.email && item.email === identity.email));
  const userId = resolveUserId(data, identity);
  if (task.assigneeIds !== undefined) return task.assigneeIds.some((id) => String(id) === String(userId));
  return task.pic.split(",").some((name) => [identity.name, identity.username, user?.name].filter(Boolean).includes(name.trim()));
}

export function memberDashboardTasks(data: AppData, identity: UserIdentity | undefined, today: string, limit = 5) {
  if (!identity) return { total: 0, items: [] as Array<{ task: Task; overdue: boolean; nearDeadline: boolean }> };
  const active = data.tasks.filter((task) => task.status !== "Done" && task.status !== "Backlog" && taskBelongsToUser(task, data, identity));
  const sorted = [...active].sort((a, b) => {
    const aDue = dashboardTaskDate(a, data, today);
    const bDue = dashboardTaskDate(b, data, today);
    const aOverdue = aDue < today;
    const bOverdue = bDue < today;
    return Number(bOverdue) - Number(aOverdue)
      || aDue.localeCompare(bDue)
      || Number(!taskIsPriority(a)) - Number(!taskIsPriority(b))
      || a.title.localeCompare(b.title, "id");
  });
  return { total: active.length, items: sorted.slice(0, limit).map((task) => {
    const due = dashboardTaskDate(task, data, today);
    const days = due === "9999-12-31" ? Infinity : Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
    return { task, overdue: due < today, nearDeadline: days >= 0 && days <= 2 };
  }) };
}

export function memberCampaigns(data: AppData, identity: UserIdentity | undefined) {
  if (!identity) return [];
  const userId = resolveUserId(data, identity);
  const included = new Set((data.campaignMembers || []).filter((member) => String(member.userId) === String(userId)).map((member) => String(member.campaignId)));
  for (const task of data.tasks) if (taskBelongsToUser(task, data, identity) && task.campaign != null) included.add(String(task.campaign));
  return data.campaigns.filter((campaign) => (campaign.lifecycleStatus || "active") === "active"
    && campaign.status !== "Selesai" && included.has(String(campaign.id)))
    .sort((a, b) => (a.endDate || "9999-12-31").localeCompare(b.endDate || "9999-12-31") || a.name.localeCompare(b.name, "id"));
}

export function memberDashboardNotes(data: AppData, identity: UserIdentity | undefined, today: string) {
  if (!identity) return { campaign: [] as CampaignDiscussionNote[], admin: [] as AdminDashboardNote[] };
  const campaignIds = new Set(memberCampaigns(data, identity).map((campaign) => String(campaign.id)));
  const userId = resolveUserId(data, identity);
  const campaign = (data.campaignNotes || []).filter((note) => note.pinnedToDashboard && campaignIds.has(String(note.campaignId)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const admin = (data.adminDashboardNotes || []).filter((note) => note.isActive
      && note.recipientIds.some((id) => String(id) === String(userId))
      && (!note.expiresAt || note.expiresAt >= today))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { campaign, admin };
}

export function isMemberDashboard(identity?: UserIdentity) {
  return Boolean(identity && !isTaskManager(identity));
}

export function campaignMemberIds(data: AppData, campaignId: EntityId) {
  return (data.campaignMembers || []).filter((member) => String(member.campaignId) === String(campaignId)).map((member) => String(member.userId));
}
