import { galleryErrorResponse, galleryJson, requireGalleryDriveAccess } from "@/lib/google-drive/access";
import { signGooglePayload } from "@/lib/google-drive/crypto";
import { cleanFolderPath, createResumableUpload, getDriveConnection, newUploadId, validateMediaUpload } from "@/lib/google-drive/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { admin, workspaceId, userId } = await requireGalleryDriveAccess(request, ["owner", "member"]);
    const body = await request.json().catch(() => ({})) as { folderPath?: string; fileName?: string; mimeType?: string; byteSize?: number };
    const fileName = validateMediaUpload(String(body.fileName || ""), String(body.mimeType || ""), Number(body.byteSize));
    const folderPath = cleanFolderPath(String(body.folderPath || ""));
    const connection = await getDriveConnection(admin, workspaceId);
    if (!connection) return galleryJson({ error: "Google Drive belum dihubungkan oleh Super Admin." }, 409);
    const uploadId = newUploadId();
    const uploadUrl = await createResumableUpload(connection, { workspaceId, userId, folderPath, fileName, mimeType: String(body.mimeType), byteSize: Number(body.byteSize), uploadId });
    const uploadToken = signGooglePayload({ workspaceId, userId, uploadId, folderPath, fileName, mimeType: String(body.mimeType), byteSize: Number(body.byteSize), exp: Date.now() + 24 * 60 * 60 * 1000 }, "upload");
    return galleryJson({ uploadUrl, uploadToken, chunkSize: 8 * 1024 * 1024 });
  } catch (error) { return galleryErrorResponse(error); }
}

