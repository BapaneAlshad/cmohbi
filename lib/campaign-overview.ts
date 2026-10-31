import type { AppData, CampaignActivity, CampaignKpiInput, EntityId, InfluencerStatusHistory, Task, TaskPatch, TaskStatusHistory, UserIdentity } from "./types.ts";
import { taskIsPriority } from "./task-workflow.ts";

export function myCampaignTasks(tasks: Task[], users: AppData["users"], identity?: UserIdentity) {
  if (!identity) return [];
  const user = identity.id != null ? users.find((item) => String(item.id) === String(identity.id)) : users.find((item) => item.username === identity.username || (identity.email && item.email === identity.email));
  const userId = identity.id ?? user?.id ?? user?.username;
  return tasks.filter((task) => {
    if (task.status === "Done") return false;
    if (task.assigneeIds !== undefined) return userId != null && task.assigneeIds.some((id) => String(id) === String(userId));
    return task.pic.split(",").some((pic) => pic.trim() === (user?.name || identity.name) || pic.trim() === identity.username);
  }).sort((a, b) => Number(!taskIsPriority(a)) - Number(!taskIsPriority(b)) || taskDate(a).localeCompare(taskDate(b)) || a.title.localeCompare(b.title, "id"));
}

export function taskDate(task: Task) {
  return task.dueDate || (/^\d{4}-\d{2}-\d{2}$/.test(task.due) ? task.due : "9999-12-31");
}

export function mergeCampaignActivities(taskHistory: TaskStatusHistory[], influencerHistory: InfluencerStatusHistory[], campaignId: EntityId): CampaignActivity[] {
  const tasks: CampaignActivity[] = taskHistory.filter((item) => String(item.campaignId) === String(campaignId)).map((item) => ({
    id: item.id, campaignId: item.campaignId!, kind: "task_status", label: `Tugas: ${item.taskTitle}`,
    actorId: item.actorId, actorName: item.actorName, fromStatus: item.fromStatus, toStatus: item.toStatus, createdAt: item.createdAt,
  }));
  const influencers: CampaignActivity[] = influencerHistory.filter((item) => String(item.campaignId) === String(campaignId)).map((item) => ({
    id: item.id, campaignId: item.campaignId, kind: "influencer_status", label: `Jadwal influencer: ${item.influencerName} · ${item.contentLabel}`,
    actorId: item.actorId, actorName: item.actorName, fromStatus: item.fromStatus, toStatus: item.toStatus, createdAt: item.createdAt,
  }));
  return [...tasks, ...influencers].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id) || a.kind.localeCompare(b.kind));
}

export function visibleCampaignActivities(items: CampaignActivity[], showAll: boolean) {
  return showAll ? items : items.slice(0, 5);
}

export function kpiProgress(kpi: CampaignKpiInput) {
  const achieved = kpi.current - kpi.baseline;
  const percentage = achieved / kpi.targetIncrease * 100;
  return { achieved, percentage, bar: Math.max(0, Math.min(100, percentage)) };
}

export function validateKpi(input: CampaignKpiInput) {
  if (!input.name.trim() || input.name.length > 160) return "Nama KPI wajib diisi dan maksimal 160 karakter.";
  if (!input.unit.trim() || input.unit.length > 40) return "Isi satuan KPI, maksimal 40 karakter.";
  if (![input.baseline, input.current, input.targetIncrease].every((value) => Number.isFinite(value) && Math.abs(value) < 1e14)) return "Isi nilai KPI dengan angka yang valid.";
  if (input.baseline < 0 || input.current < 0) return "Nilai awal dan sekarang tidak boleh negatif.";
  if (input.targetIncrease <= 0) return "Target kenaikan harus lebih dari nol.";
  return null;
}

export function validateTaskPatch(patch: TaskPatch) {
  if (patch.title !== undefined && !patch.title.trim()) return "Judul tugas wajib diisi.";
  if (patch.dueDate !== undefined) {
    const date = new Date(`${patch.dueDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== patch.dueDate) return "Pilih tanggal deadline yang valid.";
  }
  if (patch.status && !["Backlog", "To Do", "In Progress", "Review", "Revisi", "Done"].includes(patch.status)) return "Status tugas tidak valid.";
  return null;
}

export function applyTaskPatch(data: AppData, taskId: EntityId, patch: TaskPatch, identity: UserIdentity, eventId: string, createdAt: string): AppData {
  const task = data.tasks.find((item) => String(item.id) === String(taskId));
  if (!task) throw new Error("Tugas tidak ditemukan.");
  const { phaseId, ...fields } = patch;
  const nextTask = { ...task, ...fields };
  if (patch.isPriority !== undefined) nextTask.priority = patch.isPriority ? "Tinggi" : "Rendah";
  if (patch.assigneeIds) nextTask.pic = data.users.filter((user) => patch.assigneeIds!.some((id) => String(id) === String(user.id ?? user.username))).map((user) => user.name).join(", ") || "Belum ditentukan";
  const moved = patch.campaign !== undefined && String(patch.campaign) !== String(task.campaign);
  if ((patch.status && patch.status !== task.status) || moved || (patch.assigneeIds && task.pendingStatusRequest && !patch.assigneeIds.some((id) => String(id) === String(task.pendingStatusRequest!.requestedBy)))) nextTask.pendingStatusRequest = null;
  const history: TaskStatusHistory[] = patch.status && patch.status !== task.status ? [{ id: eventId, taskId: task.id, campaignId: nextTask.campaign, taskTitle: nextTask.title, actorId: identity.id ?? identity.username, actorName: identity.name, fromStatus: task.status, toStatus: patch.status, createdAt }] : [];
  return {
    ...data,
    tasks: data.tasks.map((item) => String(item.id) === String(taskId) ? nextTask : item),
    taskStatusHistory: [...history, ...(data.taskStatusHistory || [])],
    campaigns: data.campaigns.map((campaign) => {
      const removeOld = moved && String(campaign.id) === String(task.campaign);
      const assignNew = phaseId !== undefined && String(campaign.id) === String(nextTask.campaign);
      if (!removeOld && !assignNew) return campaign;
      const timeline = campaign.timelineConfig || { phaseMode: false, phases: [], taskPhase: {} };
      const taskPhase = { ...timeline.taskPhase };
      if (assignNew && phaseId) taskPhase[String(task.id)] = phaseId;
      else delete taskPhase[String(task.id)];
      return { ...campaign, timelineConfig: { ...timeline, taskPhase } };
    }),
  };
}
