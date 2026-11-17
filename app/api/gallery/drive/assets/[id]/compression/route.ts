import { GalleryDriveError, galleryErrorResponse, galleryJson, requireGalleryDriveAccess } from "@/lib/google-drive/access";
import { getDriveConnection, getDriveFile } from "@/lib/google-drive/service";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin, workspaceId } = await requireGalleryDriveAccess(request, ["owner"]);
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as { status?: string; compressedFileId?: string; compressedByteSize?: number };
    if (!body.status || !["queued", "compressed", "failed"].includes(body.status)) throw new GalleryDriveError("Status kompresi tidak valid.");
    const assetResult = await admin.from("media_assets").select("id,original_file_id").eq("workspace_id", workspaceId).eq("storage_source", "drive").eq("id", id).maybeSingle();
    if (!assetResult.data) throw new GalleryDriveError("Media tidak ditemukan.", 404);
    const patch: Record<string, unknown> = { compression_status: body.status, updated_at: new Date().toISOString() };
    if (body.status === "compressed") {
      const connection = await getDriveConnection(admin, workspaceId);
      if (!connection) throw new GalleryDriveError("Google Drive belum terhubung.", 409);
      const compressed = await getDriveFile(connection, String(body.compressedFileId || ""));
      if (compressed.appProperties?.ngapayaOriginalId !== assetResult.data.original_file_id || compressed.appProperties?.ngapayaKind !== "compressed") {
        throw new GalleryDriveError("Hasil kompresi tidak cocok dengan file asli.", 403);
      }
      patch.compressed_file_id = compressed.id;
      patch.compressed_location = `gdrive://${compressed.id}`;
      patch.compressed_byte_size = Number(compressed.size || body.compressedByteSize || 0);
    }
    const updated = await admin.from("media_assets").update(patch).eq("workspace_id", workspaceId).eq("id", id).select("*").single();
    if (updated.error) throw new GalleryDriveError("Status kompresi gagal disimpan.", 503);
    return galleryJson({ asset: updated.data });
  } catch (error) { return galleryErrorResponse(error); }
}

