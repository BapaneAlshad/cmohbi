import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppData, EntityId, Task, TaskDraft, TaskPatch, TaskStatus, TaskStatusRequest } from "../types";
import { databaseTaskStatuses } from "../task-workflow";

const statusLabel = (value: string) => (Object.keys(databaseTaskStatuses) as TaskStatus[]).find((key) => databaseTaskStatuses[key] === value) || "To Do";
export function taskStorageError(error: { message: string; code?: string }) {
  if (["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(error.code || "")) return new Error("Alur persetujuan tugas belum tersedia di database. Migrasi To-Do perlu diterapkan terlebih dahulu.");
  return new Error(error.message);
}

export function mapPendingRequest(row: { id: string; from_status: string; requested_status: string; requested_by: string; created_at: string; requested_by_name?: string }, users: AppData["users"]): TaskStatusRequest {
  return { id: row.id, fromStatus: statusLabel(row.from_status), toStatus: statusLabel(row.requested_status), requestedBy: row.requested_by, requestedByName: row.requested_by_name || users.find((user) => String(user.id) === row.requested_by)?.name || "Anggota tim", createdAt: row.created_at };
}

export async function loadTaskBoard(client: SupabaseClient, workspaceId: string, context: Pick<AppData, "users" | "brands" | "campaigns">): Promise<Task[]> {
  const tasks = await client.from("tasks").select("*").eq("workspace_id", workspaceId).order("created_at");
  if (tasks.error) throw taskStorageError(tasks.error);
  const ids = (tasks.data || []).map((row) => row.id);
  const [assignees, requests] = await Promise.all([
    ids.length ? client.from("task_assignees").select("task_id,user_id").in("task_id", ids) : { data: [], error: null },
    client.from("task_status_requests").select("*").eq("workspace_id", workspaceId).eq("state", "pending"),
  ]);
  if (assignees.error) throw taskStorageError(assignees.error);
  if (requests.error) throw taskStorageError(requests.error);
  return (tasks.data || []).map((row) => {
    const assigned = (assignees.data || []).filter((item) => item.task_id === row.id).map((item) => item.user_id);
    const assigneeIds = assigned.length ? assigned : row.assignee_id ? [row.assignee_id] : [];
    const request = (requests.data || []).find((item) => item.task_id === row.id);
    return { id: row.id, title: row.title, brand: context.brands.find((brand) => brand.id === row.brand_id)?.name || context.campaigns.find((campaign) => campaign.id === row.campaign_id)?.brand || "", brandId: row.brand_id || null, campaign: row.campaign_id, pic: context.users.filter((user) => assigneeIds.includes(String(user.id))).map((user) => user.name).join(", ") || "Belum ditentukan", assigneeIds, due: row.due_date || "Belum ditentukan", dueDate: row.due_date || undefined, status: statusLabel(row.status), priority: row.priority, isPriority: row.is_priority ?? row.priority === "Tinggi", contentCalendarType: row.content_calendar_type || null, pendingStatusRequest: request ? mapPendingRequest(request, context.users) : null };
  });
}

export async function requestTaskStatus(client: SupabaseClient, taskId: EntityId, status: TaskStatus, users: AppData["users"]): Promise<TaskStatusRequest> {
  const result = await client.rpc("request_task_status", { p_task_id: taskId, p_status: databaseTaskStatuses[status] });
  if (result.error) throw taskStorageError(result.error);
  return mapPendingRequest(result.data, users);
}

export async function decideTaskStatus(client: SupabaseClient, requestId: string, approve: boolean): Promise<string> {
  const result = await client.rpc("decide_task_status", { p_request_id: requestId, p_approve: approve });
  if (result.error) throw taskStorageError(result.error);
  return result.data.state;
}

export function databaseTaskPatch(patch: TaskPatch) {
  const values: Record<string, unknown> = {};
  if (patch.title !== undefined) values.title = patch.title.trim();
  if (patch.dueDate !== undefined) values.due_date = patch.dueDate;
  if (patch.isPriority !== undefined) values.is_priority = patch.isPriority;
  else if (patch.priority !== undefined) values.priority = patch.priority;
  if (patch.status !== undefined) values.status = databaseTaskStatuses[patch.status];
  if (patch.contentCalendarType !== undefined) values.content_calendar_type = patch.contentCalendarType;
  if (patch.phaseId !== undefined) values.phase_id = patch.phaseId;
  if (patch.campaign !== undefined) values.campaign_id = patch.campaign;
  if (patch.brandId !== undefined) values.brand_id = patch.brandId;
  if (patch.assigneeIds !== undefined) values.assignee_ids = patch.assigneeIds;
  return values;
}

export async function createTaskRecord(client: SupabaseClient, workspaceId: string, id: string, draft: TaskDraft, brandId: EntityId) {
  const result = await client.rpc("create_marketing_task", { p_workspace_id: workspaceId, p_task_id: id, p_values: databaseTaskPatch({ ...draft, brandId }) });
  if (result.error) throw taskStorageError(result.error);
}

export async function deleteTaskRecord(client: SupabaseClient, workspaceId: string, id: EntityId) {
  const result = await client.from("tasks").delete().eq("workspace_id", workspaceId).eq("id", id).select("id").maybeSingle();
  if (result.error) throw taskStorageError(result.error);
  if (!result.data) throw new Error("Tugas tidak ditemukan atau Anda tidak memiliki izin untuk menghapusnya.");
}
