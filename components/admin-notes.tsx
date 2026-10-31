"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { AdminDashboardNote, User, UserIdentity } from "@/lib/types";
import { canManageUsers } from "@/lib/user-management";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format";
import { Avatar, Icon, PageHeading } from "./ui";

type NoteInput = Pick<AdminDashboardNote, "title" | "body" | "recipientIds" | "expiresAt">;

export function AdminNotesView({ notes, users, identity, onSave, onDelete }: {
  notes: AdminDashboardNote[];
  users: User[];
  identity?: UserIdentity;
  onSave: (input: NoteInput, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<AdminDashboardNote | null | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const availableUsers = useMemo(() => users.filter((user) => user.status === "Aktif"), [users]);
  if (!canManageUsers(identity)) return <div className="card admin-notes-denied">Menu Catatan hanya tersedia untuk Super Admin.</div>;

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError("");
    const form = new FormData(event.currentTarget);
    const recipientIds = form.getAll("recipientIds").map(String);
    try {
      await onSave({ title: String(form.get("title") || "").trim(), body: String(form.get("body") || "").trim(), recipientIds, expiresAt: String(form.get("expiresAt") || "") || null }, editing?.id);
      setEditing(undefined);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Catatan gagal disimpan."); }
    finally { setPending(false); }
  };

  return <>
    <PageHeading kicker="Administrasi / Catatan" title="Catatan untuk tim" description="Buat pengumuman penting dan tentukan anggota yang perlu melihatnya di Dashboard." action={<button type="button" className="button button-primary" onClick={() => { setEditing(null); setError(""); }}><Icon name="plus" size={14} />Buat catatan</button>} />
    {notes.length ? <div className="admin-note-list">{notes.map((note) => {
      const recipients = availableUsers.filter((user) => note.recipientIds.some((id) => String(id) === String(user.id ?? user.username)));
      return <article className="card admin-note-card" key={note.id}>
        <div className="admin-note-card-heading"><div><span className={note.isActive ? "admin-note-live" : "admin-note-inactive"}>{note.isActive ? "Aktif" : "Nonaktif"}</span><h2>{note.title}</h2><p>{note.body}</p></div><div className="admin-note-card-actions"><button type="button" className="icon-button" aria-label={`Edit ${note.title}`} onClick={() => { setEditing(note); setError(""); }}><Icon name="edit" size={14} /></button><button type="button" className="icon-button danger" aria-label={`Hapus ${note.title}`} onClick={async () => { if (!window.confirm(`Hapus catatan “${note.title}”? Catatan ini tidak lagi tampil di Dashboard penerima.`)) return; try { await onDelete(note.id); } catch (caught) { setError(caught instanceof Error ? caught.message : "Catatan gagal dihapus."); } }}><Icon name="trash" size={14} /></button></div></div>
        <div className="admin-note-recipients"><strong>Penerima ({recipients.length})</strong><div>{recipients.length ? recipients.map((user) => <span className="admin-note-recipient" key={user.id ?? user.username}><Avatar name={user.name} src={user.avatarUrl} /><span>{user.name}</span></span>) : <small>Penerima tidak ditemukan pada daftar user aktif.</small>}</div></div>
        <footer><span>Dibuat {formatDisplayDateTime(note.createdAt)}</span><span>{note.expiresAt ? `Berlaku sampai ${formatDisplayDate(note.expiresAt)}` : "Tanpa tanggal kedaluwarsa"}</span></footer>
      </article>;
    })}</div> : <div className="card admin-notes-empty"><span><Icon name="pin" size={18} /></span><strong>Belum ada catatan untuk tim</strong><p>Catatan yang dibuat di sini akan tampil pada Dashboard anggota yang dipilih.</p><button type="button" className="button button-primary" onClick={() => setEditing(null)}><Icon name="plus" size={14} />Buat catatan pertama</button></div>}
    {error && !editing && <p role="alert" className="admin-note-global-error">{error}</p>}
    {editing !== undefined && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setEditing(undefined); }}><section className="modal admin-note-modal" role="dialog" aria-modal="true" aria-labelledby="admin-note-title"><div className="modal-head"><div><h2 id="admin-note-title">{editing ? "Edit catatan" : "Catatan baru"}</h2><p>Catatan akan tampil di Dashboard anggota yang dipilih.</p></div><button type="button" className="icon-button modal-close" aria-label="Tutup" disabled={pending} onClick={() => setEditing(undefined)}><Icon name="close" /></button></div>
      <form className="form-stack" onSubmit={save} key={editing?.id || "new-note"}>
        <label className="form-field">Judul<input className="modal-input" name="title" defaultValue={editing?.title} required maxLength={160} placeholder="Contoh: Persiapan materi promosi" /></label>
        <label className="form-field">Isi catatan<textarea className="modal-input admin-note-textarea" name="body" defaultValue={editing?.body} required maxLength={4000} placeholder="Tulis instruksi atau informasi penting untuk anggota tim." /></label>
        <label className="form-field">Tampilkan sampai (opsional)<input className="modal-input" type="date" name="expiresAt" defaultValue={editing?.expiresAt || ""} /></label>
        <fieldset className="admin-note-recipient-field"><legend>Penerima *</legend><div className="admin-note-recipient-grid">{availableUsers.map((user) => <label key={user.id ?? user.username}><input type="checkbox" name="recipientIds" value={String(user.id ?? user.username)} defaultChecked={editing?.recipientIds.some((id) => String(id) === String(user.id ?? user.username))} /><Avatar name={user.name} src={user.avatarUrl} /><span>{user.name}<small>{user.role}</small></span></label>)}</div>{availableUsers.length === 0 && <small>Belum ada anggota aktif di workspace ini.</small>}</fieldset>
        {error && <div className="campaign-form-error" role="alert"><Icon name="alert" size={14} />{error}</div>}
        <div className="modal-actions"><button type="button" className="button button-ghost" disabled={pending} onClick={() => setEditing(undefined)}>Batal</button><button type="submit" className="button button-primary" disabled={pending}>{pending ? "Menyimpan…" : "Simpan catatan"}</button></div>
      </form>
    </section></div>}
  </>;
}
