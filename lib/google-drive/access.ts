import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveLiveWorkspace, WorkspaceAccessError } from "@/lib/live-workspace";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireSupabaseSession } from "@/lib/supabase/server";
import { SessionAccessError, sessionResponseHeaders } from "@/lib/supabase/session";
import type { WorkspaceRole } from "@/lib/types";
import { GoogleDriveConfigurationError } from "./crypto.ts";
import { GalleryDriveError } from "./errors.ts";
export { GalleryDriveError } from "./errors.ts";

export type GalleryDriveAccess = {
  client: SupabaseClient;
  admin: SupabaseClient;
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
};

export async function requireGalleryDriveAccess(request: Request, allowed: WorkspaceRole[] = ["owner", "member", "viewer"]): Promise<GalleryDriveAccess> {
  const { client, user } = await requireSupabaseSession(request);
  if (user.is_anonymous) throw new GalleryDriveError("Login diperlukan.", 401);
  const { workspaceId, profile } = await resolveLiveWorkspace(client, user.id);
  const role = profile.accessRole;
  if (!role || !allowed.includes(role)) throw new GalleryDriveError("Anda tidak memiliki izin untuk tindakan ini.", 403);
  const admin = createSupabaseAdminClient();
  if (!admin) throw new GalleryDriveError("Konfigurasi server Supabase belum lengkap.", 503);
  return { client, admin, userId: user.id, workspaceId, role };
}

export function galleryJson(body: object, status = 200) {
  return Response.json(body, { status, headers: sessionResponseHeaders });
}

export function galleryErrorResponse(error: unknown) {
  if (error instanceof GalleryDriveError || error instanceof SessionAccessError || error instanceof WorkspaceAccessError || error instanceof GoogleDriveConfigurationError) {
    return galleryJson({ error: error.message }, error.status);
  }
  console.error("Gallery GDrive API error", error);
  return galleryJson({ error: "Layanan Google Drive belum dapat menyelesaikan permintaan." }, 503);
}

