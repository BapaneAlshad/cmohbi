import { databaseTaskPatch } from "./task-board-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignActivity, CampaignKpi, CampaignKpiInput, EntityId, Task, TaskPatch, TaskStatus, TaskStatusHistory } from "../types";

import { databaseTaskStatuses } from "../task-workflow";
const statusLabel = (value: string) => (Object.keys(databaseTaskStatuses) as TaskStatus[]).find((key) => databaseTaskStatuses[key] === value) || "To Do";
function storageError(error: { message: string; code?: string }) {
  if (["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(error.code || "")) return new Error("Fitur belum tersedia di database. Migrasi Ringkasan Campaign perlu diterapkan sebelum fitur ini dapat digunakan.");
  return new Error(error.message);
}

export async function fetchCampaignKpis(client: SupabaseClient, workspaceId: string, campaignId: EntityId): Promise<CampaignKpi[]> {
  const result = await client.from("campaign_kpis").select("*").eq("workspace_id", workspaceId).eq("campaign_id", campaignId).order("created_at");
  if (result.error) throw storageError(result.error);
  return (result.data || []).map((row) => ({ id: row.id, campaignId: row.campaign_id, name: row.name, unit: row.unit, baseline: Number(row.baseline), targetIncrease: Number(row.target_increase), current: Number(row.current_value), updatedAt: row.updated_at }));
}

export async function persistCampaignKpi(client: SupabaseClient, workspaceId: string, campaignId: EntityId, input: CampaignKpiInput, id: string) {
  const result = await client.from("campaign_kpis").upsert({ id, workspace_id: workspaceId, campaign_id: campaignId, name: input.name.trim(), unit: input.unit.trim(), baseline: input.baseline, target_increase: input.targetIncrease, current_value: input.current }).select("id").single();
  if (result.error) throw storageError(result.error);
}

export async function fetchTaskHistory(client: SupabaseClient, workspaceId: string, campaignId: EntityId, offset = 0): Promise<TaskStatusHistory[]> {
  const result = await client.from("task_status_history").select("*").eq("workspace_id", workspaceId).eq("campaign_id", campaignId).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 9);
  if (result.error) throw storageError(result.error);
  return (result.data || []).map((row) => ({ id: row.id, taskId: row.task_id, campaignId: row.campaign_id, taskTitle: row.task_title, actorId: row.actor_id, actorName: row.actor_name, fromStatus: statusLabel(row.old_status), toStatus: statusLabel(row.new_status), createdAt: row.created_at }));
}

export async function fetchCampaignActivity(client: SupabaseClient, workspaceId: string, campaignId: EntityId, offset = 0, limit = 6): Promise<CampaignActivity[]> {
  const result = await client.from("campaign_activity_feed").select("id,workspace_id,campaign_id,kind,label,actor_id,actor_name,from_status,to_status,created_at")
    .eq("workspace_id", workspaceId).eq("campaign_id", campaignId)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit - 1);
  if (result.error) throw storageError(result.error);
  return (result.data || []).map((row) => ({
    id: row.id, campaignId: row.campaign_id, kind: row.kind, label: row.label,
    actorId: row.actor_id, actorName: row.actor_name,
    fromStatus: row.kind === "task_status" ? statusLabel(row.from_status) : row.from_status,
    toStatus: row.kind === "task_status" ? statusLabel(row.to_status) : row.to_status,
    createdAt: row.created_at,
  }));
}

export async function persistTaskPatch(client: SupabaseClient, workspaceId: string, userId: string, task: Task, patch: TaskPatch) {
  const update = databaseTaskPatch(patch);
  const result = await client.rpc("update_marketing_task", { p_task_id: task.id, p_patch: update });
  if (result.error) throw storageError(result.error);
}
