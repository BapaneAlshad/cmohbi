import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserIdentity, WorkspaceRole } from "./types.ts";
import { normalizeAccessRole, profileJobTitle } from "./user-management.ts";

export class WorkspaceAccessError extends Error {
  status: number;
  constructor(message: string, status = 403) { super(message); this.status = status; }
}

// Read-only bootstrap. Login can never create users, workspaces or business records.
export async function resolveLiveWorkspace(client: SupabaseClient, userId: string): Promise<{ workspaceId: string; profile: UserIdentity }> {
  const [profile, membership] = await Promise.all([
    client.from("profiles").select("id,full_name,username,email,whatsapp,job_title,avatar_url").eq("id", userId).maybeSingle(),
    client.from("workspace_members").select("workspace_id,role").eq("user_id", userId).limit(1).maybeSingle(),
  ]);
  if (profile.error || membership.error) throw new WorkspaceAccessError("Profil atau keanggotaan workspace gagal dimuat. Coba lagi.", 503);
  if (!profile.data || !membership.data || !["owner", "admin", "member", "viewer"].includes(membership.data.role)) throw new WorkspaceAccessError("Akun belum memiliki akses workspace. Hubungi Super Admin.");
  const workspaceId = String(membership.data.workspace_id);
  const [schema, campaigns, requests] = await Promise.all([
    client.rpc("campaign_schema_version"),
    client.from("campaigns").select("id,row_version,content_config").eq("workspace_id", workspaceId).limit(1),
    client.from("task_status_requests").select("id").eq("workspace_id", workspaceId).limit(1),
  ]);
  if (schema.error || campaigns.error || requests.error || schema.data !== 1) throw new WorkspaceAccessError("Database belum siap untuk versi aplikasi ini. Migrasi Campaign dan To-Do perlu diperiksa oleh Super Admin.", 503);
  const p = profile.data;
  return { workspaceId, profile: { id: userId, name: p.full_name, username: p.username, email: p.email || "", whatsapp: p.whatsapp || "", role: profileJobTitle(p.job_title || "Anggota tim"), avatarUrl: p.avatar_url, accessRole: normalizeAccessRole(membership.data.role as WorkspaceRole) } };
}
