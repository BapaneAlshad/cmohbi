import { decryptRefreshToken } from "@/lib/google-drive/crypto";
import { galleryErrorResponse, galleryJson, requireGalleryDriveAccess } from "@/lib/google-drive/access";
import { connectionOAuthClient, getDriveConnection } from "@/lib/google-drive/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { admin, workspaceId } = await requireGalleryDriveAccess(request);
    const connection = await getDriveConnection(admin, workspaceId);
    return galleryJson({
      configured: Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.NGAPAYA_GOOGLE_MASTER_KEY),
      connected: Boolean(connection),
      account: connection ? { name: connection.account_name, email: connection.account_email, connectedAt: connection.connected_at } : null,
    });
  } catch (error) { return galleryErrorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const { admin, workspaceId } = await requireGalleryDriveAccess(request, ["owner"]);
    const connection = await getDriveConnection(admin, workspaceId);
    if (connection) {
      try {
        const { client } = await connectionOAuthClient(connection);
        await client.revokeToken(decryptRefreshToken(connection.encrypted_refresh_token));
      } catch { /* Removing the local connection must still work when Google is unavailable. */ }
      const removed = await admin.from("workspace_google_drive_connections").delete().eq("workspace_id", workspaceId);
      if (removed.error) throw removed.error;
    }
    return galleryJson({ connected: false });
  } catch (error) { return galleryErrorResponse(error); }
}

