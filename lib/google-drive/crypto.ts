import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

export class GoogleDriveConfigurationError extends Error {
  status = 503;
}

function masterKey() {
  const raw = process.env.NGAPAYA_GOOGLE_MASTER_KEY?.trim();
  if (!raw) throw new GoogleDriveConfigurationError("Kunci enkripsi Google Drive belum dikonfigurasi.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new GoogleDriveConfigurationError("Kunci enkripsi Google Drive harus berupa base64 dari 32 byte.");
  return key;
}

function derivedKey(purpose: string) {
  return Buffer.from(hkdfSync("sha256", masterKey(), Buffer.from("ngapaya-google-drive"), Buffer.from(purpose), 32));
}

function decodeBase64Url(value: string, label: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`${label} terenkripsi tidak valid.`);
  const decoded = Buffer.from(value, "base64url");
  // Reject alternate encodings that decode to the same bytes. Without this
  // check, changing unused padding bits could bypass tamper detection.
  if (decoded.toString("base64url") !== value) throw new Error(`${label} terenkripsi tidak valid.`);
  return decoded;
}

export function encryptRefreshToken(refreshToken: string) {
  if (!refreshToken) throw new Error("Refresh token Google kosong.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey("refresh-token-v1"), iv);
  const encrypted = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptRefreshToken(value: string) {
  const [version, ivValue, tagValue, encryptedValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) throw new Error("Format refresh token terenkripsi tidak valid.");
  const decipher = createDecipheriv("aes-256-gcm", derivedKey("refresh-token-v1"), decodeBase64Url(ivValue, "IV"));
  decipher.setAuthTag(decodeBase64Url(tagValue, "Tag autentikasi"));
  return Buffer.concat([decipher.update(decodeBase64Url(encryptedValue, "Token")), decipher.final()]).toString("utf8");
}

export type SignedPayload = Record<string, unknown> & { exp: number };

export function signGooglePayload(payload: SignedPayload, purpose: "oauth-state" | "upload") {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", derivedKey(`${purpose}-v1`)).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyGooglePayload<T extends SignedPayload>(value: string, purpose: "oauth-state" | "upload", now = Date.now()) {
  const [encoded, supplied] = value.split(".");
  if (!encoded || !supplied) throw new Error("Izin Google Drive tidak valid.");
  const expected = createHmac("sha256", derivedKey(`${purpose}-v1`)).update(encoded).digest();
  const actual = Buffer.from(supplied, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Izin Google Drive tidak valid.");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
  if (!Number.isFinite(payload.exp) || payload.exp < now) throw new Error("Izin Google Drive sudah kedaluwarsa.");
  return payload;
}

export function oauthStateExpiry() {
  return Date.now() + STATE_TTL_MS;
}

