import { GalleryDriveError, galleryErrorResponse, galleryJson, requireGalleryDriveAccess } from "@/lib/google-drive/access";
import { verifyGooglePayload, type SignedPayload } from "@/lib/google-drive/crypto";
import { getDriveConnection, getDriveFile, upsertCatalogAsset } from "@/lib/google-drive/service";

export const runtime = "nodejs";

type UploadClaims = SignedPayload & { workspaceId: string; userId: string; uploadId: string; folderPath: string; fileName: string; mimeType: string; byteSize: number };

export async function POST(request: Request) {
  try {
    const { admin, workspaceId, userId } = await requireGalleryDriveAccess(request, ["owner", "member"]);
    const body = await request.json().catch(() => ({})) as { uploadToken?: string; fileId?: string };
    const claims = verifyGooglePayload<UploadClaims>(String(body.uploadToken || ""), "upload");
    if (claims.workspaceId !== workspaceId || claims.userId !== userId) throw new GalleryDriveError("Sesi upload tidak cocok dengan workspace.", 403);
    const connection = await getDriveConnection(admin, workspaceId);
    if (!connection) throw new GalleryDriveError("Google Drive belum terhubung.", 409);
    const file = await getDriveFile(connection, String(body.fileId || ""));
    if (file.appProperties?.ngapayaWorkspaceId !== workspaceId || file.appProperties.ngapayaUploadId !== claims.uploadId || file.name !== claims.fileName || file.mimeType !== claims.mimeType || Number(file.size || 0) !== claims.byteSize) {
      throw new GalleryDriveError("File hasil upload gagal diverifikasi.", 403);
    }
    const asset = await upsertCatalogAsset(admin, workspaceId, userId, { ...file, folderPath: claims.folderPath });
    return galleryJson({ asset });
  } catch (error) { return galleryErrorResponse(error); }
}

