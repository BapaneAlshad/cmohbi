import { galleryErrorResponse, GalleryDriveError, requireGalleryDriveAccess } from "@/lib/google-drive/access";
import { decryptRefreshToken, encryptRefreshToken, verifyGooglePayload, type SignedPayload } from "@/lib/google-drive/crypto";
import { connectionOAuthClient, createGoogleOAuthClient, DRIVE_SCOPES, findOrCreateRootFolder, getDriveConnection, googleRedirectUri, type DriveConnection } from "@/lib/google-drive/service";

export const runtime = "nodejs";

type OAuthState = SignedPayload & { workspaceId: string; userId: string; origin: string; replace?: boolean; nonce: string };

function popupResponse(origin: string, ok: boolean, message: string, status = 200) {
  const payload = JSON.stringify({ source: "ngapaya-google-drive", ok, message });
  const safeOrigin = JSON.stringify(origin);
  const safeMessage = message.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  return new Response(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Google Drive Ngapaya</title></head><body style="font-family:system-ui;padding:32px"><h1>${ok ? "Google Drive terhubung" : "Koneksi gagal"}</h1><p>${safeMessage}</p><p>Jendela ini boleh ditutup.</p><script>if(window.opener){window.opener.postMessage(${payload},${safeOrigin});window.close()}</script></body></html>`, {
    status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  let origin = new URL(request.url).origin;
  try {
    const url = new URL(request.url);
    const stateValue = url.searchParams.get("state") || "";
    const state = verifyGooglePayload<OAuthState>(stateValue, "oauth-state");
    origin = state.origin;
    if (url.searchParams.get("error")) throw new GalleryDriveError("Otorisasi Google dibatalkan atau ditolak.", 400);
    const code = url.searchParams.get("code");
    if (!code) throw new GalleryDriveError("Kode otorisasi Google tidak ditemukan.");

    const access = await requireGalleryDriveAccess(request, ["owner"]);
    if (access.userId !== state.userId || access.workspaceId !== state.workspaceId) throw new GalleryDriveError("Sesi workspace tidak cocok dengan permintaan OAuth.", 403);

    const oauth = createGoogleOAuthClient(googleRedirectUri(request.url));
    const tokenResult = await oauth.getToken(code);
    oauth.setCredentials(tokenResult.tokens);
    const accessToken = tokenResult.tokens.access_token || (await oauth.getAccessToken()).token;
    if (!accessToken) throw new GalleryDriveError("Google tidak mengembalikan access token.", 502);
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const googleUser = await userResponse.json() as { sub?: string; email?: string; name?: string };
    if (!userResponse.ok || !googleUser.sub || !googleUser.email) throw new GalleryDriveError("Identitas akun Google tidak dapat diverifikasi.", 502);

    const existing = await getDriveConnection(access.admin, access.workspaceId);
    if (existing && existing.google_subject !== googleUser.sub && !state.replace) {
      throw new GalleryDriveError("Workspace sudah memakai akun Google lain. Pilih ganti akun dari Setting untuk melanjutkan.", 409);
    }
    const encryptedRefreshToken = tokenResult.tokens.refresh_token
      ? encryptRefreshToken(tokenResult.tokens.refresh_token)
      : existing?.google_subject === googleUser.sub ? existing.encrypted_refresh_token : "";
    if (!encryptedRefreshToken) throw new GalleryDriveError("Google tidak mengembalikan refresh token. Hubungkan ulang dan berikan persetujuan akses.", 409);

    const temporary = {
      workspace_id: access.workspaceId,
      connected_by: access.userId,
      google_subject: googleUser.sub,
      account_email: googleUser.email,
      account_name: googleUser.name || googleUser.email,
      root_folder_id: existing?.google_subject === googleUser.sub ? existing.root_folder_id : "",
      encrypted_refresh_token: encryptedRefreshToken,
      scopes: (tokenResult.tokens.scope || DRIVE_SCOPES.join(" ")).split(/\s+/).filter(Boolean),
      connected_at: existing?.google_subject === googleUser.sub ? existing.connected_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } satisfies DriveConnection;
    temporary.root_folder_id = temporary.root_folder_id || await findOrCreateRootFolder(temporary, access.workspaceId);

    const saved = await access.admin.from("workspace_google_drive_connections").upsert(temporary, { onConflict: "workspace_id" });
    if (saved.error) throw new GalleryDriveError("Koneksi Google Drive gagal disimpan.", 503);
    if (existing && existing.google_subject !== googleUser.sub) {
      const cleared = await access.admin.from("media_assets").delete().eq("workspace_id", access.workspaceId).eq("storage_source", "drive");
      if (cleared.error) throw new GalleryDriveError("Akun baru tersambung, tetapi katalog akun lama gagal dilepas.", 503);
      try {
        const { client } = await connectionOAuthClient(existing);
        await client.revokeToken(decryptRefreshToken(existing.encrypted_refresh_token));
      } catch { /* The old account may already have revoked access. */ }
    }
    return popupResponse(origin, true, `Akun ${googleUser.email} berhasil dihubungkan.`);
  } catch (error) {
    const response = galleryErrorResponse(error);
    const body = await response.json().catch(() => ({ error: "Koneksi Google Drive gagal." })) as { error?: string };
    return popupResponse(origin, false, body.error || "Koneksi Google Drive gagal.", response.status);
  }
}

