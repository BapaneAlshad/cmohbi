import { galleryErrorResponse, galleryJson, requireGalleryDriveAccess } from "@/lib/google-drive/access";
import { getDriveConnection, listManagedDriveFiles, upsertCatalogAsset } from "@/lib/google-drive/service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const { admin, workspaceId } = await requireGalleryDriveAccess(request, ["owner", "member"]);
    const connection = await getDriveConnection(admin, workspaceId);
    if (!connection) return galleryJson({ error: "Google Drive belum dihubungkan oleh Super Admin." }, 409);
    const files = await listManagedDriveFiles(connection, workspaceId);
    for (const file of files) await upsertCatalogAsset(admin, workspaceId, file.appProperties?.ngapayaUploaderId || null, file);
    return galleryJson({ synced: files.length });
  } catch (error) { return galleryErrorResponse(error); }
}

