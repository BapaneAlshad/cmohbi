import type { User, UserIdentity, WorkspaceRole } from "./types.ts";
import { isValidPin, isValidUsername, normalizeUsername } from "./auth-identity.ts";

export const userJobTitles = ["Super Admin", "Content Creator", "Creative Designer", "Support Marketing", "Finance", "Tim Konten", "Anggota tim", "Guest"];
export const accessLevels: Array<{ value: WorkspaceRole; label: string; description: string }> = [
  { value: "owner", label: "Super Admin", description: "Kelola workspace, campaign, tugas, persetujuan, serta user dan level akses." },
  { value: "member", label: "Anggota tim", description: "Jalankan pekerjaan dan ajukan perubahan status tugas yang ditugaskan kepada Anda." },
  { value: "viewer", label: "Viewer", description: "Lihat data workspace dengan akses baca saja." },
];
export type ManagedUserInput = { name: string; username: string; email: string; whatsapp: string; role: string; accessRole: WorkspaceRole; pin?: string; avatarUrl?: string | null };
// Keep the legacy database enum readable, while exposing one privileged level.
export const normalizeAccessRole = (role?: WorkspaceRole): WorkspaceRole => role === "admin" ? "owner" : role || "member";
export const profileJobTitle = (title: string) => ["CMO", "Admin", "CMO / Admin"].includes(title) ? "Super Admin" : title;
export const canManageUsers = (identity?: Pick<UserIdentity, "accessRole"> | null) => normalizeAccessRole(identity?.accessRole) === "owner";
export const isWorkspaceRole = (value: unknown): value is WorkspaceRole => accessLevels.some((level) => level.value === value);
export function roleForJobTitle(title: string): WorkspaceRole {
  return profileJobTitle(title) === "Super Admin" ? "owner" : title === "Guest" ? "viewer" : "member";
}
export const userAccessRole = (user: Pick<User, "accessRole" | "role">): WorkspaceRole => normalizeAccessRole(user.accessRole || roleForJobTitle(user.role));
export function validateManagedUser(input: ManagedUserInput, creating = false) {
  if (input.name.trim().length < 2) return "Nama lengkap minimal 2 karakter.";
  if (!isValidUsername(input.username)) return "Username harus 3–32 karakter dan diawali huruf.";
  if (creating && normalizeUsername(input.username).startsWith("demo.")) return "Username demo dicadangkan untuk akun Super Admin bawaan.";
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return "Email profil tidak valid.";
  if (input.whatsapp && input.whatsapp.trim().length < 8) return "Nomor WhatsApp minimal 8 karakter.";
  if (!userJobTitles.includes(input.role)) return "Peran pekerjaan tidak valid.";
  if (!isWorkspaceRole(input.accessRole)) return "Level akses tidak valid.";
  if (creating && !isValidPin(input.pin || "")) return "PIN harus terdiri dari 6 angka.";
  return null;
}

const retiredDemoNames = new Set(["demo.cmo", "demo.content.creator", "demo.creative.designer", "demo.support.marketing", "demo.finance", "demo.guest"]);
const legacySeedNames = new Set(["andi.saputra", "rani.putri", "dimas.arya", "sinta.dewi"]);
export function cleanLocalUsers(users: User[], owner: User): User[] {
  const savedOwner = users.find((user) => normalizeUsername(user.username) === owner.username);
  const kept = users.filter((user) => {
    const username = normalizeUsername(user.username);
    return username !== owner.username && !retiredDemoNames.has(username) && !(legacySeedNames.has(username) && !user.id && !user.accessRole);
  });
  const result: User[] = [{ ...owner, ...savedOwner, id: savedOwner?.id || owner.id, accessRole: "owner", status: "Aktif" }, ...kept];
  return result.map((user) => ({ ...user, role: profileJobTitle(user.role), accessRole: userAccessRole(user) }));
}
