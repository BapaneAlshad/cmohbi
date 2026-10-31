import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminDashboardNote, CampaignDiscussionNote, EntityId } from "../types";

function explain(error: { message: string; code?: string }) {
  if (["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(error.code || "")) {
    return new Error("Fitur catatan belum tersedia di database. Tinjau lalu terapkan migrasi Campaign Dashboard Notes.");
  }
  return new Error(error.message);
}

function mapCampaignNote(row: Record<string, any>): CampaignDiscussionNote {
  return { id: row.id, campaignId: row.campaign_id, authorId: row.author_id, authorName: row.author_name, body: row.body, createdAt: row.created_at, replyTo: row.reply_to, pinnedToDashboard: row.pinned_to_dashboard };
}

function mapAdminNote(row: Record<string, any>): AdminDashboardNote {
  return { id: row.id, title: row.title, body: row.body, createdBy: row.created_by, createdByName: row.created_by_name, recipientIds: row.recipient_ids || [], expiresAt: row.expires_at, isActive: row.is_active, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function persistCampaignMembers(client: SupabaseClient, campaignId: EntityId, memberIds: EntityId[]) {
  const result = await client.rpc("save_campaign_members", { p_campaign_id: campaignId, p_member_ids: memberIds.map(String) });
  if (result.error) throw explain(result.error);
}

export async function persistCampaignNote(client: SupabaseClient, campaignId: EntityId, body: string, replyTo?: string): Promise<CampaignDiscussionNote> {
  const result = await client.rpc("create_campaign_note", { p_campaign_id: campaignId, p_body: body, p_reply_to: replyTo || null });
  if (result.error) throw explain(result.error);
  return mapCampaignNote(result.data);
}

export async function persistCampaignNotePin(client: SupabaseClient, campaignId: EntityId, noteId: string, pinned: boolean) {
  const result = await client.rpc("set_campaign_note_pinned", { p_campaign_id: campaignId, p_note_id: noteId, p_pinned: pinned });
  if (result.error) throw explain(result.error);
}

export async function persistAdminDashboardNote(client: SupabaseClient, workspaceId: string, input: Pick<AdminDashboardNote, "title" | "body" | "recipientIds" | "expiresAt">, id?: string): Promise<AdminDashboardNote> {
  const result = await client.rpc("save_admin_dashboard_note", {
    p_workspace_id: workspaceId, p_id: id || null, p_title: input.title, p_body: input.body,
    p_expires_at: input.expiresAt || null, p_recipient_ids: input.recipientIds.map(String),
  });
  if (result.error) throw explain(result.error);
  return mapAdminNote(result.data);
}

export async function deleteAdminDashboardNote(client: SupabaseClient, workspaceId: string, id: string) {
  const result = await client.rpc("delete_admin_dashboard_note", { p_workspace_id: workspaceId, p_id: id });
  if (result.error) throw explain(result.error);
}

export { mapAdminNote, mapCampaignNote };
