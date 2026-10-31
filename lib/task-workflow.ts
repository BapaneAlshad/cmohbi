import type { AppData, EntityId, Task, TaskStatus, TaskStatusRequest, UserIdentity } from "./types.ts";

export const databaseTaskStatuses: Record<TaskStatus, string> = { Backlog: "backlog", "To Do": "todo", "In Progress": "in_progress", Review: "review", Revisi: "revision", Done: "done" };
export const taskStatuses: TaskStatus[] = ["Backlog", "To Do", "In Progress", "Review", "Revisi", "Done"];
export const memberTransitions: Record<TaskStatus, TaskStatus[]> = {
  Backlog: [], "To Do": ["In Progress"], "In Progress": ["Review"], Review: ["Done", "Revisi"], Revisi: ["In Progress", "Review"], Done: [],
};
export const isTaskManager = (identity?: UserIdentity) => identity?.accessRole === "owner" || identity?.accessRole === "admin";
export const taskIsPriority = (task: Pick<Task, "isPriority" | "priority">) => task.isPriority ?? task.priority === "Tinggi";
export const boardTaskStatus = (task: Task) => task.pendingStatusRequest?.toStatus || task.status;

export function isTaskAssignee(task: Task, users: AppData["users"], identity?: UserIdentity) {
  if (!identity) return false;
  const user = identity.id != null ? users.find((item) => String(item.id) === String(identity.id)) : users.find((item) => item.username === identity.username || (identity.email && item.email === identity.email));
  const id = identity.id ?? user?.id ?? user?.username;
  if (task.assigneeIds !== undefined) return id != null && task.assigneeIds.some((assigned) => String(assigned) === String(id));
  return task.pic.split(",").some((pic) => pic.trim() === (user?.name || identity.name) || pic.trim() === identity.username);
}

export function allowedTaskStatuses(task: Task, users: AppData["users"], identity?: UserIdentity): TaskStatus[] {
  if (task.pendingStatusRequest || !identity || identity.accessRole === "viewer") return [];
  if (isTaskManager(identity)) return taskStatuses;
  return identity.accessRole === "member" && isTaskAssignee(task, users, identity) ? memberTransitions[task.status] : [];
}

export function filteredBoardTasks(data: AppData, identity: UserIdentity | undefined, filters: { brand: string; pic: "all" | "mine"; campaign: string }) {
  const activeCampaigns = new Set(data.campaigns.filter((item) => item.lifecycleStatus === "active").map((item) => String(item.id)));
  return data.tasks.filter((task) =>
    (isTaskManager(identity) || task.status !== "Backlog") &&
    (task.campaign == null || activeCampaigns.has(String(task.campaign))) &&
    (filters.brand === "all" || task.brand === filters.brand) &&
    (filters.pic === "all" || isTaskAssignee(task, data.users, identity)) &&
    (filters.campaign === "all" || (filters.campaign === "none" ? task.campaign == null : String(task.campaign) === filters.campaign))
  );
}

export function applyStatusRequest(data: AppData, id: EntityId, request: TaskStatusRequest): AppData {
  return { ...data, tasks: data.tasks.map((task) => String(task.id) === String(id) ? { ...task, pendingStatusRequest: request } : task) };
}
