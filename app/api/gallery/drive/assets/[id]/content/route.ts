import { GalleryDriveError, galleryErrorResponse, requireGalleryDriveAccess } from "@/lib/google-drive/access";
import { driveFetch, getDriveConnection } from "@/lib/google-drive/service";

export const runtime = "nodejs";
export const maxDuration = 300;

function contentDisposition(fileName: string, download: boolean) {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

async function respond(request: Request, paramsPromise: Promise<{ id: string }>, head = false) {
  try {
    const { admin, workspaceId } = await requireGalleryDriveAccess(request);
    const { id } = await paramsPromise;
    const assetResult = await admin.from("media_assets").select("file_name,mime_type,original_file_id,compressed_file_id,compression_status").eq("workspace_id", workspaceId).eq("storage_source", "drive").eq("id", id).maybeSingle();
    if (assetResult.error) throw new GalleryDriveError("Katalog media gagal dibaca.", 503);
    if (!assetResult.data) throw new GalleryDriveError("Media tidak ditemukan.", 404);
    const useCompressed = new URL(request.url).searchParams.get("version") === "compressed" && assetResult.data.compression_status === "compressed";
    const fileId = useCompressed ? assetResult.data.compressed_file_id : assetResult.data.original_file_id;
    if (!fileId) throw new GalleryDriveError("File Google Drive tidak ditemukan.", 404);
    const connection = await getDriveConnection(admin, workspaceId);
    if (!connection) throw new GalleryDriveError("Google Drive belum terhubung. Hubungi Super Admin.", 409);
    const range = request.headers.get("range");
    const upstream = await driveFetch(connection, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: range ? { Range: range } : head ? { Range: "bytes=0-0" } : undefined });
    if (!upstream.ok && upstream.status !== 206) throw new GalleryDriveError(upstream.status === 404 ? "File tidak ditemukan di Google Drive." : "File tidak dapat dibaca dari Google Drive.", upstream.status === 404 ? 404 : 502);
    const headers = new Headers({
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": upstream.headers.get("content-type") || assetResult.data.mime_type || "application/octet-stream",
      "Content-Disposition": contentDisposition(assetResult.data.file_name, new URL(request.url).searchParams.get("download") === "1"),
      "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes",
      "X-Content-Type-Options": "nosniff",
    });
    for (const name of ["content-length", "content-range"]) { const value = upstream.headers.get(name); if (value) headers.set(name, value); }
    return new Response(head ? null : upstream.body, { status: head ? 200 : upstream.status, headers });
  } catch (error) { return galleryErrorResponse(error); }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { return respond(request, params); }
export async function HEAD(request: Request, { params }: { params: Promise<{ id: string }> }) { return respond(request, params, true); }

