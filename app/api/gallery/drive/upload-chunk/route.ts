import { GalleryDriveError, galleryErrorResponse, galleryJson, requireGalleryDriveAccess } from "@/lib/google-drive/access";
import { verifyGooglePayload, type SignedPayload } from "@/lib/google-drive/crypto";
import { driveFetch, getDriveConnection } from "@/lib/google-drive/service";

export const runtime = "nodejs";

const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
type UploadClaims = SignedPayload & { workspaceId: string; userId: string; uploadUrl: string; byteSize: number };

export async function POST(request: Request) {
  try {
    const { admin, workspaceId, userId } = await requireGalleryDriveAccess(request, ["owner", "member"]);
    const token = request.headers.get("x-upload-token") || "";
    const claims = verifyGooglePayload<UploadClaims>(token, "upload");
    if (claims.workspaceId !== workspaceId || claims.userId !== userId || !claims.uploadUrl.startsWith("https://www.googleapis.com/upload/drive/")) {
      throw new GalleryDriveError("Sesi upload tidak cocok dengan workspace.", 403);
    }
    const contentRange = request.headers.get("content-range")?.match(/^bytes (\d+)-(\d+)\/(\d+)$/i);
    if (!contentRange) throw new GalleryDriveError("Rentang upload tidak valid.");
    const start = Number(contentRange[1]), end = Number(contentRange[2]), total = Number(contentRange[3]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || !Number.isSafeInteger(total) || end < start || total !== claims.byteSize || end - start + 1 > MAX_CHUNK_BYTES) throw new GalleryDriveError("Ukuran chunk upload tidak valid.");
    const body = await request.arrayBuffer();
    if (body.byteLength !== end - start + 1) throw new GalleryDriveError("Isi chunk tidak sesuai dengan Content-Range.");
    const connection = await getDriveConnection(admin, workspaceId);
    if (!connection) throw new GalleryDriveError("Google Drive belum terhubung.", 409);
    const upstream = await driveFetch(connection, claims.uploadUrl, { method: "PUT", headers: { "Content-Type": request.headers.get("content-type") || "application/octet-stream", "Content-Length": String(body.byteLength), "Content-Range": `bytes ${start}-${end}/${total}` }, body });
    if (upstream.status === 308) return galleryJson({ status: "partial", range: upstream.headers.get("range") || null });
    const result = await upstream.json().catch(() => ({})) as { id?: string; error?: { message?: string } };
    if (!upstream.ok) throw new GalleryDriveError(result.error?.message || "Google Drive menolak chunk upload.", 502);
    if (!result.id) throw new GalleryDriveError("Google Drive tidak mengembalikan ID file.", 502);
    return galleryJson({ status: "complete", fileId: result.id });
  } catch (error) { return galleryErrorResponse(error); }
}

