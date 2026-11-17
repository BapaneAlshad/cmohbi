import { randomUUID } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptRefreshToken } from "./crypto.ts";
import { GalleryDriveError } from "./errors.ts";

export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "openid",
  "email",
  "profile",
];
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
export const MAX_DRIVE_FILE_BYTES = 50 * 1024 * 1024 * 1024;

export type DriveConnection = {
  workspace_id: string;
  connected_by: string | null;
  google_subject: string;
  account_email: string;
  account_name: string;
  root_folder_id: string;
  encrypted_refresh_token: string;
  scopes: string[];
  connected_at: string;
  updated_at: string;
};

export type ManagedDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  parents?: string[];
  appProperties?: Record<string, string>;
  thumbnailLink?: string;
  webViewLink?: string;
};

function googleConfig() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new GalleryDriveError("OAuth Google Drive belum dikonfigurasi di server.", 503);
  return { clientId, clientSecret };
}

export function googleRedirectUri(requestUrl?: string) {
  const configured = process.env.GOOGLE_DRIVE_REDIRECT_URI?.trim();
  if (configured) return configured;
  const base = process.env.APP_URL?.trim() || (requestUrl ? new URL(requestUrl).origin : "");
  if (!base) throw new GalleryDriveError("Alamat callback Google Drive belum dikonfigurasi.", 503);
  return `${base.replace(/\/+$/, "")}/api/gallery/drive/oauth/callback`;
}

export function createGoogleOAuthClient(redirectUri: string) {
  const { clientId, clientSecret } = googleConfig();
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

export async function getDriveConnection(admin: SupabaseClient, workspaceId: string) {
  const result = await admin.from("workspace_google_drive_connections").select("*").eq("workspace_id", workspaceId).maybeSingle();
  if (result.error) throw new GalleryDriveError("Koneksi Google Drive belum tersedia di database.", 503);
  return result.data as DriveConnection | null;
}

export async function connectionOAuthClient(connection: DriveConnection) {
  const client = createGoogleOAuthClient(googleRedirectUri());
  client.setCredentials({ refresh_token: decryptRefreshToken(connection.encrypted_refresh_token) });
  const token = await client.getAccessToken();
  if (!token.token) throw new GalleryDriveError("Sesi Google Drive tidak dapat diperbarui. Hubungkan ulang akun Google.", 409);
  return { client, accessToken: token.token };
}

export async function driveFetch(connection: DriveConnection, input: string, init: RequestInit = {}) {
  const { accessToken } = await connectionOAuthClient(connection);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(input, { ...init, headers, cache: "no-store" });
  return response;
}

async function driveJson<T>(connection: DriveConnection, input: string, init: RequestInit = {}) {
  const response = await driveFetch(connection, input, init);
  const result = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) throw new GalleryDriveError(result.error?.message || "Google Drive menolak permintaan.", response.status === 404 ? 404 : 502);
  return result;
}

function driveQuery(value: string) {
  return encodeURIComponent(value);
}

export function cleanFolderPath(value: string) {
  const parts = value.split(/[\\/]+/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) throw new GalleryDriveError("Isi nama album/folder sebelum mengunggah.");
  if (parts.length > 12 || parts.some((part) => part.length > 100 || part === "." || part === "..")) throw new GalleryDriveError("Nama album tidak valid atau terlalu panjang.");
  return parts.join("/");
}

export function validateMediaUpload(name: string, mimeType: string, size: number) {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 255 || /[\u0000-\u001f]/.test(cleanName)) throw new GalleryDriveError("Nama file tidak valid.");
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_DRIVE_FILE_BYTES) throw new GalleryDriveError("Ukuran file harus lebih dari 0 dan maksimal 50 GB.");
  if (!/^(image|video|audio)\//.test(mimeType)) throw new GalleryDriveError("Hanya file gambar, video, atau audio yang didukung.");
  return cleanName;
}

export async function findOrCreateRootFolder(connection: Pick<DriveConnection, "encrypted_refresh_token">, workspaceId: string) {
  const typed = connection as DriveConnection;
  const q = `mimeType='${DRIVE_FOLDER_MIME}' and name='Ngapaya Media' and trashed=false and appProperties has { key='ngapayaWorkspaceId' and value='${workspaceId}' }`;
  const found = await driveJson<{ files?: ManagedDriveFile[] }>(typed, `https://www.googleapis.com/drive/v3/files?q=${driveQuery(q)}&spaces=drive&fields=files(id,name)&pageSize=10`);
  if (found.files?.[0]?.id) return found.files[0].id;
  const created = await driveJson<ManagedDriveFile>(typed, "https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Ngapaya Media", mimeType: DRIVE_FOLDER_MIME, appProperties: { ngapayaWorkspaceId: workspaceId, ngapayaKind: "root" } }),
  });
  return created.id;
}

async function findOrCreateChildFolder(connection: DriveConnection, workspaceId: string, parentId: string, name: string) {
  const escaped = name.replace(/'/g, "\\'");
  const q = `mimeType='${DRIVE_FOLDER_MIME}' and name='${escaped}' and '${parentId}' in parents and trashed=false`;
  const found = await driveJson<{ files?: ManagedDriveFile[] }>(connection, `https://www.googleapis.com/drive/v3/files?q=${driveQuery(q)}&spaces=drive&fields=files(id,name)&pageSize=10`);
  if (found.files?.[0]?.id) return found.files[0].id;
  const created = await driveJson<ManagedDriveFile>(connection, "https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: DRIVE_FOLDER_MIME, parents: [parentId], appProperties: { ngapayaWorkspaceId: workspaceId, ngapayaKind: "album" } }),
  });
  return created.id;
}

export async function ensureAlbumFolder(connection: DriveConnection, workspaceId: string, folderPath: string) {
  let parentId = connection.root_folder_id;
  for (const part of cleanFolderPath(folderPath).split("/")) parentId = await findOrCreateChildFolder(connection, workspaceId, parentId, part);
  return parentId;
}

export async function createResumableUpload(connection: DriveConnection, input: { workspaceId: string; userId: string; folderPath: string; fileName: string; mimeType: string; byteSize: number; uploadId: string }) {
  const parentId = await ensureAlbumFolder(connection, input.workspaceId, input.folderPath);
  const response = await driveFetch(connection, "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,createdTime,parents,appProperties,webViewLink", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": input.mimeType, "X-Upload-Content-Length": String(input.byteSize) },
    body: JSON.stringify({
      name: input.fileName,
      mimeType: input.mimeType,
      parents: [parentId],
      appProperties: { ngapayaWorkspaceId: input.workspaceId, ngapayaUploaderId: input.userId, ngapayaFolderPath: input.folderPath, ngapayaUploadId: input.uploadId, ngapayaKind: "original" },
    }),
  });
  if (!response.ok) throw new GalleryDriveError("Google Drive tidak dapat memulai sesi upload.", 502);
  const uploadUrl = response.headers.get("location");
  if (!uploadUrl) throw new GalleryDriveError("Google Drive tidak mengembalikan alamat upload.", 502);
  return uploadUrl;
}

export async function getDriveFile(connection: DriveConnection, fileId: string) {
  return driveJson<ManagedDriveFile>(connection, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,createdTime,parents,appProperties,thumbnailLink,webViewLink`);
}

export async function listManagedDriveFiles(connection: DriveConnection, workspaceId: string) {
  const files: Array<ManagedDriveFile & { folderPath: string }> = [];
  const queue: Array<{ id: string; path: string }> = [{ id: connection.root_folder_id, path: "" }];
  while (queue.length) {
    const current = queue.shift()!;
    let pageToken = "";
    do {
      const q = `'${current.id}' in parents and trashed=false`;
      const result = await driveJson<{ files?: ManagedDriveFile[]; nextPageToken?: string }>(connection,
        `https://www.googleapis.com/drive/v3/files?q=${driveQuery(q)}&spaces=drive&pageSize=1000&fields=nextPageToken,files(id,name,mimeType,size,createdTime,parents,appProperties,thumbnailLink,webViewLink)${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
      for (const file of result.files || []) {
        if (file.mimeType === DRIVE_FOLDER_MIME) queue.push({ id: file.id, path: [current.path, file.name].filter(Boolean).join("/") });
        else if (file.appProperties?.ngapayaWorkspaceId === workspaceId && /^(image|video|audio)\//.test(file.mimeType)) files.push({ ...file, folderPath: file.appProperties.ngapayaFolderPath || current.path });
      }
      pageToken = result.nextPageToken || "";
    } while (pageToken);
  }
  return files;
}

export async function upsertCatalogAsset(admin: SupabaseClient, workspaceId: string, userId: string | null, file: ManagedDriveFile & { folderPath?: string }) {
  const row = {
    workspace_id: workspaceId,
    created_by: userId,
    storage_source: "drive",
    folder_path: file.folderPath || file.appProperties?.ngapayaFolderPath || "",
    file_name: file.name,
    mime_type: file.mimeType,
    byte_size: Number(file.size || 0),
    original_location: `gdrive://${file.id}`,
    original_file_id: file.id,
    compression_status: "original",
    created_at: file.createdTime || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const result = await admin.from("media_assets").upsert(row, { onConflict: "workspace_id,storage_source,original_file_id" }).select("*").single();
  if (result.error) throw new GalleryDriveError("Katalog media gagal diperbarui.", 503);
  return result.data as Record<string, unknown>;
}

export async function trashDriveFile(connection: DriveConnection, fileId: string) {
  await driveJson(connection, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,trashed`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }),
  });
}

export function newUploadId() { return randomUUID(); }

