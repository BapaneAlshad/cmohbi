"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { EntityId, User, UserIdentity, WorkspaceRole } from "@/lib/types";
import { accessLevels, canManageUsers, profileJobTitle, roleForJobTitle, userAccessRole, userJobTitles, validateManagedUser, type ManagedUserInput } from "@/lib/user-management";
import { validateUserAvatar } from "@/lib/user-avatar";
import { Avatar, Icon, PageHeading } from "./ui";

type Props = { users: User[]; identity: UserIdentity; onSave: (input: ManagedUserInput, id?: EntityId) => Promise<void>; onResetPin: (username: string, pin: string) => Promise<void>; onUploadAvatar: (file: File, userId: EntityId) => Promise<string> };
export function UserManagementView({ users, identity, onSave, onResetPin, onUploadAvatar }: Props) {
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<User | null | undefined>();
  const [resetUser, setResetUser] = useState<User | null>(null);
  if (!canManageUsers(identity)) return <section className="card campaign-state-card"><Icon name="users" size={24} /><h2>Akses terbatas</h2><p>Manajemen user hanya tersedia untuk Super Admin.</p></section>;
  const filtered = users.filter((user) => `${user.name} ${user.username} ${user.email} ${user.role}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <PageHeading kicker="Akun / Manajemen User" title="Manajemen User" description="Kelola akun, jabatan, foto profil, dan akses anggota tim." action={<button className="button button-primary" onClick={() => setEditor(null)}><Icon name="plus" size={15} />Tambah user</button>} />
    <section className="card user-management-card"><div className="card-header"><div><h2 className="card-title">User workspace</h2><p className="card-subtitle">Hanya Super Admin dapat mengubah akun dan level akses.</p></div><label className="brand-search user-search"><Icon name="search" size={14} /><input aria-label="Cari user" placeholder="Cari nama atau username..." value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
      <div className="table-wrap"><table className="data-table user-management-table"><thead><tr><th>User</th><th>Jabatan</th><th>Level akses</th><th>Aksi</th></tr></thead><tbody>{filtered.map((user) => <tr key={String(user.id || user.username)}><td><div className="table-person"><Avatar name={user.name} src={user.avatarUrl} /><span><strong>{user.name}{user.username === identity.username ? " (Anda)" : ""}</strong><small>@{user.username}</small></span></div></td><td>{profileJobTitle(user.role)}</td><td><span className={`user-access-badge ${userAccessRole(user)}`}>{accessLevels.find((level) => level.value === userAccessRole(user))?.label}</span></td><td><div className="user-row-actions"><button className="button button-soft button-sm" onClick={() => setEditor(user)} aria-label={`Edit user ${user.name}`}><Icon name="edit" size={13} />Edit</button><button className="button button-ghost button-sm" onClick={() => setResetUser(user)} aria-label={`Reset PIN ${user.name}`}>Reset PIN</button></div></td></tr>)}</tbody></table></div>
      {!filtered.length && <div className="brand-inline-empty">User tidak ditemukan.</div>}
    </section>
    <section className="user-access-guide" aria-label="Panduan level akses">{accessLevels.map((level) => <div className="card" key={level.value}><strong>{level.label}</strong><p>{level.description}</p></div>)}</section>
    {editor !== undefined && <UserEditor key={String(editor?.id || "new")} user={editor} identity={identity} onSave={onSave} onUploadAvatar={onUploadAvatar} onClose={() => setEditor(undefined)} />}
    {resetUser && <UserPinDialog user={resetUser} onSave={onResetPin} onClose={() => setResetUser(null)} />}
  </>;
}

function UserEditor({ user, identity, onSave, onUploadAvatar, onClose }: { user: User | null; identity: UserIdentity; onSave: Props["onSave"]; onUploadAvatar: Props["onUploadAvatar"]; onClose: () => void }) {
  const [role, setRole] = useState(profileJobTitle(user?.role || "Content Creator"));
  const [accessRole, setAccessRole] = useState<WorkspaceRole>(user ? userAccessRole(user) : "member");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl || null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const pendingRef = useRef(false), dialogRef = useRef<HTMLElement>(null);
  const isSelf = user?.username === identity.username;
  useUserDialog(dialogRef, pendingRef, onClose);
  const uploadAvatar = async (file?: File) => {
    if (!file || !user || pendingRef.current) return;
    const validation = validateUserAvatar(file);
    if (validation) return setError(validation);
    pendingRef.current = true; setPending(true); setError("");
    try { setAvatarUrl(await onUploadAvatar(file, user.id || user.username)); }
    catch (error) { setError((error as Error).message); }
    finally { pendingRef.current = false; setPending(false); }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (pendingRef.current) return;
    const values = new FormData(event.currentTarget);
    const input: ManagedUserInput = { name: String(values.get("name") || "").trim(), username: String(values.get("username") || "").trim().toLowerCase(), email: user?.email || "", whatsapp: user?.whatsapp || "", role, accessRole: user ? accessRole : roleForJobTitle(role), ...(user ? { avatarUrl } : { pin: String(values.get("pin") || "") }) };
    const validation = validateManagedUser(input, !user);
    if (validation) return setError(validation);
    pendingRef.current = true; setPending(true); setError("");
    try { await onSave(input, user?.id || user?.username); onClose(); }
    catch (error) { setError((error as Error).message); }
    finally { pendingRef.current = false; setPending(false); }
  };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pendingRef.current) onClose(); }}><section ref={dialogRef} className="modal user-editor" role="dialog" aria-modal="true" aria-labelledby="user-editor-title"><div className="modal-head"><div><h2 id="user-editor-title">{user ? "Edit user" : "Tambah user"}</h2><p>{user ? "Perbarui profil, peran pekerjaan, dan izin workspace." : "Siapkan akun dengan username dan PIN untuk anggota tim."}</p></div><button className="icon-button" onClick={onClose} disabled={pending} aria-label="Tutup"><Icon name="close" /></button></div><form className="form-stack" onSubmit={submit} aria-busy={pending}><fieldset className="user-form-fields" disabled={pending}>
    <div className="two-fields"><label className="form-field">Nama lengkap *<input className="modal-input" name="name" required minLength={2} defaultValue={user?.name} /></label><label className="form-field">Username *<input className="modal-input" name="username" required minLength={3} maxLength={32} pattern="[a-z][a-z0-9._-]{2,31}" defaultValue={user?.username} readOnly={Boolean(user)} autoCapitalize="none" autoComplete="off" /></label></div>
    {!user && <label className="form-field">PIN awal *<input className="modal-input" name="pin" type="password" required pattern="[0-9]{6}" minLength={6} maxLength={6} inputMode="numeric" autoComplete="new-password" /></label>}
    <label className="form-field">Jabatan *<select className="modal-input" aria-label="Jabatan" value={role} onChange={(event) => { setRole(event.target.value); if (!user) setAccessRole(roleForJobTitle(event.target.value)); }}>{Array.from(new Set([...userJobTitles, ...(user?.role ? [profileJobTitle(user.role)] : [])])).map((title) => <option key={title}>{title}</option>)}</select></label>
    {user && <><div className="user-avatar-editor"><Avatar name={user.name} src={avatarUrl} /><div><label className="button button-soft button-sm user-avatar-upload">{pending ? "Memproses…" : "Ganti foto profil"}<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Ganti foto profil" disabled={pending} onChange={(event) => { void uploadAvatar(event.target.files?.[0]); event.target.value = ""; }} /></label><p className="campaign-form-hint">PNG, JPEG, atau WebP. Maksimal 2 MB.</p>{avatarUrl && <button type="button" className="button button-ghost button-sm" onClick={() => setAvatarUrl(null)}>Hapus foto</button>}</div></div><label className="form-field">Level akses<select className="modal-input" aria-label="Level akses" value={accessRole} onChange={(event) => setAccessRole(event.target.value as WorkspaceRole)} disabled={isSelf}>{accessLevels.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}</select></label><p className="campaign-form-hint">{accessLevels.find((level) => level.value === accessRole)?.description}{isSelf && " Level akses akun Anda sendiri tetap Super Admin."}</p></>}
    </fieldset>{error && <div className="campaign-form-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose} disabled={pending}>Batal</button><button className="button button-primary" disabled={pending}>{pending ? "Menyimpan…" : user ? "Simpan perubahan" : "Buat user"}</button></div></form></section></div>;
}

function UserPinDialog({ user, onSave, onClose }: { user: User; onSave: Props["onResetPin"]; onClose: () => void }) {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const pendingRef = useRef(false), dialogRef = useRef<HTMLElement>(null);
  useUserDialog(dialogRef, pendingRef, onClose);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (pendingRef.current) return;
    const values = new FormData(event.currentTarget), pin = String(values.get("pin") || "");
    if (pin !== String(values.get("confirmPin") || "")) return setError("Konfirmasi PIN tidak sama.");
    pendingRef.current = true; setPending(true); setError("");
    try { await onSave(user.username, pin); onClose(); }
    catch (error) { setError((error as Error).message); }
    finally { pendingRef.current = false; setPending(false); }
  };
  return <div className="modal-backdrop"><section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="user-pin-title"><div className="modal-head"><div><h2 id="user-pin-title">Reset PIN user</h2><p>PIN baru untuk {user.name} (@{user.username}).</p></div><button className="icon-button" onClick={onClose} disabled={pending} aria-label="Tutup"><Icon name="close" /></button></div><form className="form-stack" onSubmit={submit}><label className="form-field">PIN baru *<input className="modal-input" name="pin" type="password" required pattern="[0-9]{6}" minLength={6} maxLength={6} inputMode="numeric" autoComplete="new-password" disabled={pending} /></label><label className="form-field">Konfirmasi PIN *<input className="modal-input" name="confirmPin" type="password" required pattern="[0-9]{6}" minLength={6} maxLength={6} inputMode="numeric" autoComplete="new-password" disabled={pending} /></label>{error && <div className="campaign-form-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose} disabled={pending}>Batal</button><button className="button button-primary" disabled={pending}>{pending ? "Menyimpan…" : "Reset PIN"}</button></div></form></section></div>;
}

function useUserDialog(ref: React.RefObject<HTMLElement | null>, pending: React.RefObject<boolean>, onClose: () => void) {
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLInputElement>("input")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending.current) closeRef.current();
      if (event.key !== "Tab") return;
      const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>("input:not([disabled]),select:not([disabled]),button:not([disabled])") || []);
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [ref, pending]);
}
