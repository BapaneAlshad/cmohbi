export const USER_AVATAR_BUCKET = "user-avatars";
export const MAX_USER_AVATAR_BYTES = 2 * 1024 * 1024;
export function validateUserAvatar(file: { size: number; type: string }) {
  if (!file.size || file.size > MAX_USER_AVATAR_BYTES) return "Ukuran foto harus antara 1 byte dan 2 MB.";
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return "Gunakan foto PNG, JPEG, atau WebP.";
  return null;
}
export function userAvatarExtension(bytes: Uint8Array, mime: string) {
  if (mime === "image/png" && [137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value)) return "png";
  if (mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  if (mime === "image/webp" && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") return "webp";
  return null;
}
export function isManagedAvatarUrl(value: string, supabaseUrl: string, workspaceId: string, userId: string) {
  try {
    const url = new URL(value), base = new URL(supabaseUrl);
    const prefix = `/storage/v1/object/public/${USER_AVATAR_BUCKET}/${workspaceId}/${userId}/`;
    return url.origin === base.origin && !url.username && !url.password && !url.search && !url.hash && url.pathname.startsWith(prefix) && /^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(url.pathname.slice(prefix.length));
  } catch { return false; }
}
