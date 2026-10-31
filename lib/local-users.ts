import { demoAccount } from "./demo-account.ts";
import { isValidPin, normalizeUsername } from "./auth-identity.ts";
import { profileJobTitle, userAccessRole } from "./user-management.ts";
import type { User, UserIdentity } from "./types.ts";

const CREDENTIAL_KEY = "ngapaya-local-user-credentials-v1";
export type LocalCredential = { salt: string; hash: string };
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
const bytes = (value: string) => Uint8Array.from(value.match(/.{2}/g) || [], (part) => parseInt(part, 16));
async function derivePin(pin: string, salt: Uint8Array) {
  if (!crypto.subtle) throw new Error("Login user lokal memerlukan HTTPS atau localhost.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as Uint8Array<ArrayBuffer>, iterations: 210_000 }, key, 256)));
}
export async function hashLocalPin(pin: string): Promise<LocalCredential> {
  if (!isValidPin(pin)) throw new Error("PIN harus terdiri dari 6 angka.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: hex(salt), hash: await derivePin(pin, salt) };
}
export async function verifyLocalPin(pin: string, credential: LocalCredential) {
  if (!isValidPin(pin) || !/^[a-f0-9]{32}$/.test(credential.salt) || !/^[a-f0-9]{64}$/.test(credential.hash)) return false;
  return await derivePin(pin, bytes(credential.salt)) === credential.hash;
}
function credentials(): Record<string, LocalCredential> {
  try { return JSON.parse(window.localStorage.getItem(CREDENTIAL_KEY) || "{}"); } catch { return {}; }
}
export async function setLocalPin(username: string, pin: string) {
  const next = { ...credentials(), [normalizeUsername(username)]: await hashLocalPin(pin) };
  window.localStorage.setItem(CREDENTIAL_KEY, JSON.stringify(next));
}
export async function authenticateLocalUser(users: User[], username: string, pin: string): Promise<UserIdentity | null> {
  const normalized = normalizeUsername(username);
  const user = users.find((item) => normalizeUsername(item.username) === normalized && item.status === "Aktif");
  if (!user) return null;
  const stored = credentials()[normalized];
  const valid = stored ? await verifyLocalPin(pin, stored) : normalized === demoAccount.username && pin === demoAccount.pin;
  if (!valid) return null;
  return { id: user.id || user.username, name: user.name, username: user.username, email: user.email, whatsapp: user.whatsapp, role: profileJobTitle(user.role), accessRole: userAccessRole(user), avatarUrl: user.avatarUrl };
}
