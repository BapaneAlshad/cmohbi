import { GalleryDriveError, galleryErrorResponse, galleryJson, requireGalleryDriveAccess } from "@/lib/google-drive/access";
import { getDriveConnection, trashDriveFile } from "@/lib/google-drive/service";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin, workspaceId } = await requireGalleryDriveAccess(request, ["owner", "member"]);
    const { id } = await params;
    const assetResult = await admin.from("media_assets").select("id,original_file_id,compressed_file_id").eq("workspace_id", workspaceId).eq("storage_source", "drive").eq("id", id).maybeSingle();
    if (assetResult.error) throw new GalleryDriveError("Katalog media gagal dibaca.", 503);
    if (!assetResult.data) throw new GalleryDriveError("Media tidak ditemukan.", 404);
    const connection = await getDriveConnection(admin, workspaceId);
    if (!connection) throw new GalleryDriveError("Google Drive belum terhubung.", 409);
    const ids = [assetResult.data.original_file_id, assetResult.data.compressed_file_id].filter((value): value is string => Boolean(value));
    for (const fileId of ids) await trashDriveFile(connection, fileId);
    const removed = await admin.from("media_assets").delete().eq("workspace_id", workspaceId).eq("id", id);
    if (removed.error) throw new GalleryDriveError("Media sudah dipindahkan ke Sampah Drive, tetapi katalog gagal dihapus.", 503);
    return galleryJson({ removed: true });
  } catch (error) { return galleryErrorResponse(error); }
}

