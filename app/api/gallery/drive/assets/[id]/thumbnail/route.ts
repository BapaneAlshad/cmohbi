import { GalleryDriveError, galleryErrorResponse, requireGalleryDriveAccess } from "@/lib/google-drive/access";
import { driveFetch, getDriveConnection, getDriveFile } from "@/lib/google-drive/service";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin, workspaceId } = await requireGalleryDriveAccess(request);
    const { id } = await params;
    const assetResult = await admin.from("media_assets").select("original_file_id,compressed_file_id,compression_status").eq("workspace_id", workspaceId).eq("storage_source", "drive").eq("id", id).maybeSingle();
    if (!assetResult.data) throw new GalleryDriveError("Media tidak ditemukan.", 404);
    const fileId = assetResult.data.compression_status === "compressed" && assetResult.data.compressed_file_id ? assetResult.data.compressed_file_id : assetResult.data.original_file_id;
    if (!fileId) throw new GalleryDriveError("File Google Drive tidak ditemukan.", 404);
    const connection = await getDriveConnection(admin, workspaceId);
    if (!connection) throw new GalleryDriveError("Google Drive belum terhubung.", 409);
    const file = await getDriveFile(connection, fileId);
    if (!file.thumbnailLink) throw new GalleryDriveError("Thumbnail belum tersedia.", 404);
    const upstream = await driveFetch(connection, file.thumbnailLink.replace(/=s\d+$/, "=s640"));
    if (!upstream.ok) throw new GalleryDriveError("Thumbnail belum tersedia.", 404);
    return new Response(upstream.body, { status: 200, headers: { "Content-Type": upstream.headers.get("content-type") || "image/jpeg", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return galleryErrorResponse(error); }
}

