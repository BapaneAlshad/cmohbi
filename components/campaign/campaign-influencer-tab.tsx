"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AppData, Campaign, CampaignInfluencerBookingPatch, CampaignInfluencerTheme, EntityId, InfluencerBookingStatus, InfluencerPaymentStatus, InfluencerSchedule } from "@/lib/types";
import { formatDisplayDate } from "@/lib/date-format";
import { calculateInfluencerPaidAmount, displayInfluencerBookingStatus, displayInfluencerPaymentStatus, influencerBookingStatusTone, influencerBookingStatuses, influencerPaymentStatuses, influencerPaymentStatusTone, validateInfluencerContentLink, validateInfluencerScheduleDates } from "@/lib/campaign-influencer";
import { Avatar, Icon, rupiah, StatusPill } from "@/components/ui";

type BookingEditDraft = { themeId: string; visitDate: string; uploadDate: string; notes: string; contentLink: string };

export function CampaignInfluencerTab({ campaign, themes, schedules, influencers, canEdit, canManagePayments, canDeleteThemes, onDeleteTheme, onDeleteBooking, onPaymentChange, onAddTheme, onEditTheme, onAddBooking, onBookingChange }: {
  campaign: Campaign; themes: CampaignInfluencerTheme[]; schedules: AppData["influencerSchedules"]; influencers: AppData["influencers"]; canEdit: boolean; canManagePayments: boolean; canDeleteThemes: boolean;
  onDeleteTheme: (id: EntityId) => Promise<void>; onDeleteBooking: (id: EntityId) => Promise<void>; onAddTheme: () => void; onEditTheme: (theme: CampaignInfluencerTheme) => void; onAddBooking: () => void;
  onPaymentChange: (id: EntityId, status: InfluencerPaymentStatus, amount?: number) => Promise<void>;
  onBookingChange: (id: EntityId, patch: CampaignInfluencerBookingPatch) => Promise<void>;
}) {
  const savingRows = useRef(new Set<string>());
  const themeDialogRef = useRef<HTMLElement>(null);
  const bookingDialogRef = useRef<HTMLElement>(null);
  const [pendingRows, setPendingRows] = useState<string[]>([]);
  const [saveError, setSaveError] = useState("");
  const [themeActionError, setThemeActionError] = useState("");
  const [bookingActionError, setBookingActionError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingDeleteBookingId, setPendingDeleteBookingId] = useState<string | null>(null);
  const [viewingTheme, setViewingTheme] = useState<CampaignInfluencerTheme | null>(null);
  const [editingBooking, setEditingBooking] = useState<InfluencerSchedule | null>(null);
  const [bookingDraft, setBookingDraft] = useState<BookingEditDraft | null>(null);
  const [bookingEditError, setBookingEditError] = useState("");
  const [paymentDialogBooking, setPaymentDialogBooking] = useState<InfluencerSchedule | null>(null);
  const [paymentDraftAmount, setPaymentDraftAmount] = useState("");
  const [paymentError, setPaymentError] = useState("");

  useEffect(() => {
    if (!viewingTheme) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = themeDialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])') || []);
    focusable()[0]?.focus();
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setViewingTheme(null); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); previousFocus?.focus(); };
  }, [viewingTheme]);

  useEffect(() => {
    if (!editingBooking) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = bookingDialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])') || []);
    focusable()[0]?.focus();
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !savingRows.current.has(String(editingBooking.id))) { event.preventDefault(); closeBookingEditor(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); previousFocus?.focus(); };
  }, [Boolean(editingBooking)]);

  const closeBookingEditor = () => { setEditingBooking(null); setBookingDraft(null); setBookingEditError(""); };

  const deleteTheme = async (theme: CampaignInfluencerTheme) => {
    if (!canDeleteThemes || pendingDeleteId) return;
    const linkedCount = schedules.filter((item) => String(item.themeId ?? "") === String(theme.id)).length;
    const linkedMessage = linkedCount
      ? `${linkedCount} jadwal influencer yang memakai tema ini akan tetap tersimpan, tetapi hubungannya dengan tema akan dilepas. Biaya dan pembayaran tetap aman.`
      : "Jadwal influencer dan data keuangan tidak akan dihapus.";
    if (!window.confirm(`Hapus tema ${theme.code} — ${theme.name}?\n\n${linkedMessage}`)) return;
    setPendingDeleteId(String(theme.id));
    setThemeActionError("");
    try { await onDeleteTheme(theme.id); }
    catch (error) { setThemeActionError(error instanceof Error ? error.message : "Tema belum dapat dihapus."); }
    finally { setPendingDeleteId(null); }
  };

  const updateBooking = async (id: EntityId, patch: CampaignInfluencerBookingPatch, onError?: (message: string) => void) => {
    const key = String(id);
    if (!canEdit || savingRows.current.has(key)) return false;
    savingRows.current.add(key);
    setPendingRows((current) => [...current, key]);
    setSaveError("");
    try {
      await onBookingChange(id, patch);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Jadwal belum dapat disimpan.";
      setSaveError(message);
      onError?.(message);
      return false;
    } finally {
      savingRows.current.delete(key);
      setPendingRows((current) => current.filter((item) => item !== key));
    }
  };

  const savePayment = async (item: InfluencerSchedule, status: InfluencerPaymentStatus, amount?: number) => {
    const key = String(item.id);
    if (!canManagePayments || savingRows.current.has(key)) return false;
    savingRows.current.add(key);
    setPendingRows((current) => [...current, key]);
    setBookingActionError("");
    try {
      await onPaymentChange(item.id, status, amount);
      return true;
    } catch (error) {
      setBookingActionError(error instanceof Error ? error.message : "Status pembayaran belum dapat disimpan.");
      setPaymentError(error instanceof Error ? error.message : "Status pembayaran belum dapat disimpan.");
      return false;
    } finally {
      savingRows.current.delete(key);
      setPendingRows((current) => current.filter((rowId) => rowId !== key));
    }
  };

  const changePaymentStatus = async (item: InfluencerSchedule, value: string) => {
    if (!canManagePayments || !influencerPaymentStatuses.includes(value as InfluencerPaymentStatus)) return;
    const status = value as InfluencerPaymentStatus;
    if (status === "DP dibayar") {
      setPaymentError("");
      setPaymentDraftAmount(item.spent > 0 && item.spent < item.rate ? String(item.spent) : "");
      setPaymentDialogBooking(item);
      return;
    }
    if (status === "Belum dibayar" && item.spent > 0 && !window.confirm(`Ubah ${item.influencer} menjadi Belum dibayar?\n\nNilai spent ${rupiah(item.spent)} akan dikurangi dari realisasi Campaign.`)) return;
    setPaymentError("");
    await savePayment(item, status);
  };

  const submitDeposit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!paymentDialogBooking) return;
    const amount = Number(paymentDraftAmount);
    const validation = calculateInfluencerPaidAmount("DP dibayar", paymentDialogBooking.rate, amount);
    if (validation.error || validation.amount === undefined) { setPaymentError(validation.error || "Nominal DP tidak valid."); return; }
    setPaymentError("");
    if (await savePayment(paymentDialogBooking, "DP dibayar", validation.amount)) {
      setPaymentDialogBooking(null);
      setPaymentDraftAmount("");
    }
  };

  const openBookingEditor = (item: InfluencerSchedule) => {
    setBookingActionError("");
    setBookingEditError("");
    setEditingBooking(item);
    setBookingDraft({ themeId: String(item.themeId ?? ""), visitDate: item.visitDate || "", uploadDate: item.uploadDate === undefined ? item.date || "" : item.uploadDate || "", notes: item.notes || "", contentLink: item.contentLink || "" });
  };

  const saveBookingEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingBooking || !bookingDraft || pendingRows.includes(String(editingBooking.id))) return;
    setBookingEditError("");
    const dateError = validateInfluencerScheduleDates(bookingDraft.visitDate, bookingDraft.uploadDate);
    if (dateError) { setBookingEditError(dateError); return; }
    const contentLink = displayInfluencerBookingStatus(editingBooking.status) === "Selesai" ? bookingDraft.contentLink.trim() || null : undefined;
    if (contentLink !== undefined) {
      const linkError = validateInfluencerContentLink(contentLink || "");
      if (linkError) { setBookingEditError(linkError); return; }
    }
    const saved = await updateBooking(editingBooking.id, {
      themeId: bookingDraft.themeId || null,
      visitDate: bookingDraft.visitDate || null,
      uploadDate: bookingDraft.uploadDate || null,
      notes: bookingDraft.notes,
      ...(contentLink !== undefined ? { contentLink } : {}),
    }, setBookingEditError);
    if (saved) closeBookingEditor();
  };

  const deleteBooking = async (item: InfluencerSchedule) => {
    if (!canEdit || pendingDeleteBookingId || pendingRows.includes(String(item.id))) return;
    const confirmed = window.confirm(`Hapus jadwal ${item.influencer} — ${item.themeName || item.content}?\n\nPenghapusan ini permanen. Jadwal, data spent, dan status pembayaran booking ini ikut terhapus dari Campaign.`);
    if (!confirmed) return;
    setPendingDeleteBookingId(String(item.id));
    setBookingActionError("");
    try { await onDeleteBooking(item.id); }
    catch (error) { setBookingActionError(error instanceof Error ? error.message : "Jadwal belum dapat dihapus."); }
    finally { setPendingDeleteBookingId(null); }
  };

  const changeStatus = (item: InfluencerSchedule, value: string) => {
    if (!influencerBookingStatuses.includes(value as InfluencerBookingStatus)) return;
    void updateBooking(item.id, { status: value as InfluencerBookingStatus });
  };

  return <div className="campaign-influencer-tab">
    <section className="card campaign-influencer-section">
      <div className="card-header"><div><h2 className="card-title">Tema konten campaign</h2></div>
        {canEdit && <button className="button button-primary" onClick={onAddTheme}><Icon name="plus" size={14} />Tambah tema</button>}
      </div>
      {themeActionError && <div className="campaign-form-error" role="alert">{themeActionError}</div>}
      {themes.length ? <div className="table-wrap campaign-theme-table-wrap"><table className={`data-table campaign-theme-table${canEdit ? " editable" : ""}${canDeleteThemes ? " can-delete" : ""}`}><thead><tr><th>Kode</th><th>Tema</th><th>Fase</th><th>Tujuan</th><th>Isi wajib</th><th>CTA</th><th>Aksi</th></tr></thead><tbody>{themes.map((theme) => <tr key={String(theme.id)}>
        <td><span className="campaign-theme-code">{theme.code}</span></td>
        <td><strong className="campaign-theme-name" title={theme.name}>{theme.name}</strong></td>
        <td>{theme.phase || <span className="campaign-theme-empty-value">Belum ditentukan</span>}</td>
        <td title={theme.objective || "Belum ditentukan"}><span className="campaign-theme-table-copy">{theme.objective || "Belum ditentukan"}</span></td>
        <td title={theme.requiredContent || "Belum ditentukan"}><span className="campaign-theme-table-copy">{theme.requiredContent || "Belum ditentukan"}</span></td>
        <td title={theme.cta || "Belum ditentukan"}><span className="campaign-theme-table-copy">{theme.cta || "Belum ditentukan"}</span></td>
        <td><div className="campaign-theme-actions"><button className="icon-button campaign-theme-edit" onClick={() => setViewingTheme(theme)} aria-label={`Lihat tema ${theme.name}`} title={`Lihat ${theme.name}`}><Icon name="eye" size={14} /></button>{canEdit && <button className="icon-button campaign-theme-edit" onClick={() => onEditTheme(theme)} aria-label={`Edit tema ${theme.name}`} title={`Edit ${theme.name}`}><Icon name="edit" size={14} /></button>}{canDeleteThemes && <button className="icon-button campaign-theme-edit danger" disabled={pendingDeleteId === String(theme.id) || pendingDeleteId !== null} onClick={() => void deleteTheme(theme)} aria-label={`Hapus tema ${theme.name}`} title={pendingDeleteId === String(theme.id) ? "Menghapus tema…" : `Hapus ${theme.name}`}><Icon name="trash" size={14} /></button>}</div></td>
      </tr>)}</tbody></table></div> : <div className="campaign-influencer-empty"><Icon name="book" size={20} /><strong>Belum ada tema konten</strong><span>Tambah tema agar brief influencer dapat dipilih saat membuat jadwal.</span>{canEdit && <button className="button button-soft button-sm" onClick={onAddTheme}>Tambah tema pertama</button>}</div>}
    </section>
    {viewingTheme && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewingTheme(null); }}><section ref={themeDialogRef} className="modal campaign-detail-modal campaign-theme-detail-modal" role="dialog" aria-modal="true" aria-labelledby="campaign-theme-detail-title" aria-describedby="campaign-theme-detail-description"><div className="modal-head"><div><span className="campaign-theme-code">{viewingTheme.code}</span><h2 id="campaign-theme-detail-title" className="campaign-theme-detail-title">{viewingTheme.name}</h2><p id="campaign-theme-detail-description">Detail brief tema konten untuk campaign {campaign.name}.</p></div><button type="button" className="icon-button modal-close" onClick={() => setViewingTheme(null)} aria-label="Tutup detail tema"><Icon name="close" /></button></div><dl className="campaign-theme-detail-list"><div><dt>Fase</dt><dd>{viewingTheme.phase || "Belum ditentukan"}</dd></div><div><dt>Tujuan</dt><dd>{viewingTheme.objective || "Belum ditentukan"}</dd></div><div><dt>Isi wajib</dt><dd>{viewingTheme.requiredContent || "Belum ditentukan"}</dd></div><div><dt>CTA</dt><dd>{viewingTheme.cta || "Belum ditentukan"}</dd></div></dl><div className="modal-actions"><button type="button" className="button button-soft" onClick={() => setViewingTheme(null)}>Tutup</button></div></section></div>}
    <section className="card campaign-influencer-section">
      <div className="card-header"><div><h2 className="card-title">Jadwal influencer</h2></div>
        {canEdit && <button className="button button-primary" disabled={!themes.length || !influencers.length} title={!themes.length ? "Buat tema terlebih dahulu" : !influencers.length ? "Tambahkan influencer di Data Influencer" : undefined} onClick={onAddBooking}><Icon name="plus" size={14} />Tambah jadwal</button>}
      </div>
      {saveError && <div className="campaign-form-error" role="alert">{saveError}</div>}
      {bookingActionError && <div className="campaign-form-error" role="alert">{bookingActionError}</div>}
      {pendingRows.length > 0 && <p className="campaign-muted-copy" role="status">Menyimpan jadwal…</p>}
      {!themes.length && schedules.length === 0 ? <div className="campaign-influencer-empty compact"><strong>Tema diperlukan sebelum membuat jadwal</strong><span>Tambahkan tema konten di bagian atas.</span></div> : schedules.length ? <div className="table-wrap">
        <table className="data-table campaign-influencer-table"><thead><tr><th>Influencer</th><th>Tema konten</th><th>Tgl visit</th><th>Tgl upload</th><th>Rate / spent</th><th>Status kerja sama</th><th>Status pembayaran</th>{schedules.some((item) => displayInfluencerBookingStatus(item.status) === "Selesai") && <th>Link konten</th>}{canEdit && <th>Aksi</th>}</tr></thead>
          <tbody>{schedules.map((item) => {
            const pending = pendingRows.includes(String(item.id)) || pendingDeleteBookingId === String(item.id);
            const uploadDate = item.uploadDate === undefined ? item.date || "" : item.uploadDate || "";
            const normalizedStatus = displayInfluencerBookingStatus(item.status);
            const normalizedPayment = displayInfluencerPaymentStatus(item.paymentStatus);
            const validPaymentStatus = influencerPaymentStatuses.includes(normalizedPayment as InfluencerPaymentStatus);
            return <tr key={String(item.id)} aria-busy={pending}>
              <td><div className="table-person"><Avatar name={item.influencer} /><div><strong>{item.influencer}</strong><small>{item.platform}</small></div></div></td>
              <td><span className="campaign-influencer-readonly-copy" title={item.themeName || item.content}>{item.themeName || item.content || "Belum ada tema"}</span>{!item.themeId && <small>Tidak terkait dengan tema</small>}{item.notes && <small className="campaign-influencer-note" title={item.notes}>{item.notes}</small>}</td>
              <td>{formatDisplayDate(item.visitDate)}</td>
              <td>{formatDisplayDate(uploadDate)}</td>
              <td>{rupiah(item.rate)}<small>Spent {rupiah(item.spent)}</small></td>
              <td>{canEdit ? <select className={`input campaign-influencer-status-select cooperation-${influencerBookingStatusTone(item.status)}`} aria-label={`Status kerja sama ${item.influencer}`} disabled={pending} value={influencerBookingStatuses.includes(normalizedStatus as InfluencerBookingStatus) ? normalizedStatus : item.status} onChange={(event) => changeStatus(item, event.target.value)}>
                {!influencerBookingStatuses.includes(normalizedStatus as InfluencerBookingStatus) && <option value={item.status} disabled>{item.status}</option>}
                {influencerBookingStatuses.map((status) => <option value={status} key={status}>{status}</option>)}
              </select> : <StatusPill status={normalizedStatus} className={`campaign-influencer-status-pill cooperation-${influencerBookingStatusTone(item.status)}`} />}</td>
              <td>{canManagePayments ? <select className={`input campaign-influencer-status-select campaign-payment-status-select payment-${influencerPaymentStatusTone(item.paymentStatus)}`} aria-label={`Status pembayaran ${item.influencer}`} disabled={pending} value={validPaymentStatus ? normalizedPayment : item.paymentStatus} onChange={(event) => void changePaymentStatus(item, event.target.value)}>
                {!validPaymentStatus && <option value={item.paymentStatus} disabled>{item.paymentStatus}</option>}
                {influencerPaymentStatuses.map((status) => <option value={status} key={status}>{status}</option>)}
              </select> : <StatusPill status={normalizedPayment} className={`campaign-influencer-status-pill payment-${influencerPaymentStatusTone(item.paymentStatus)}`} />}</td>
              {schedules.some((schedule) => displayInfluencerBookingStatus(schedule.status) === "Selesai") && <td>{normalizedStatus === "Selesai" ? item.contentLink ? <a className="campaign-content-link" href={item.contentLink} target="_blank" rel="noreferrer">Buka konten <Icon name="external" size={11} /></a> : <span className="campaign-influencer-empty-value">Belum ditambahkan</span> : <span className="campaign-influencer-empty-value">—</span>}</td>}
              {canEdit && <td><div className="campaign-theme-actions campaign-booking-actions"><button type="button" className="button button-soft button-sm" disabled={pending} onClick={() => openBookingEditor(item)}><Icon name="edit" size={13} />Edit</button><button type="button" className="icon-button campaign-theme-edit danger" disabled={pending} onClick={() => void deleteBooking(item)} aria-label={`Hapus jadwal ${item.influencer}`} title={pendingDeleteBookingId === String(item.id) ? "Menghapus jadwal…" : "Hapus jadwal"}><Icon name="trash" size={14} /></button></div></td>}
            </tr>;
          })}</tbody>
        </table>
      </div> : <div className="campaign-influencer-empty"><Icon name="calendar" size={20} /><strong>Belum ada jadwal influencer</strong><span>Pilih influencer dari Data Influencer dan tetapkan tema serta tanggal visit/upload.</span>{canEdit && influencers.length > 0 && <button className="button button-soft button-sm" onClick={onAddBooking}>Buat jadwal pertama</button>}</div>}
    </section>
    {editingBooking && bookingDraft && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pendingRows.includes(String(editingBooking.id))) closeBookingEditor(); }}><section ref={bookingDialogRef} className="modal campaign-detail-modal campaign-booking-edit-modal" role="dialog" aria-modal="true" aria-labelledby="campaign-booking-edit-title"><div className="modal-head"><div><h2 id="campaign-booking-edit-title">Edit jadwal influencer</h2><p>{editingBooking.influencer} · {editingBooking.platform}</p></div><button type="button" className="icon-button modal-close" disabled={pendingRows.includes(String(editingBooking.id))} onClick={closeBookingEditor} aria-label="Tutup edit jadwal"><Icon name="close" /></button></div>
      <form onSubmit={(event) => void saveBookingEdit(event)}>
        <div className="campaign-booking-locked-summary"><span><small>Influencer</small><strong>{editingBooking.influencer}</strong></span><span><small>Rate / spent</small><strong>{rupiah(editingBooking.rate)} / {rupiah(editingBooking.spent)}</strong></span><span><small>Pembayaran</small><StatusPill status={displayInfluencerPaymentStatus(editingBooking.paymentStatus)} className={`campaign-influencer-status-pill payment-${influencerPaymentStatusTone(editingBooking.paymentStatus)}`} /></span></div>
        <div className="campaign-booking-edit-fields">
          <label>Tema konten<select className="input" disabled={pendingRows.includes(String(editingBooking.id))} value={bookingDraft.themeId} onChange={(event) => setBookingDraft({ ...bookingDraft, themeId: event.target.value })}><option value="">Tidak ada tema</option>{themes.map((theme) => <option value={String(theme.id)} key={String(theme.id)}>{theme.code} · {theme.name}</option>)}</select></label>
          <label>Tanggal visit<input className="input" type="date" disabled={pendingRows.includes(String(editingBooking.id))} value={bookingDraft.visitDate} onChange={(event) => setBookingDraft({ ...bookingDraft, visitDate: event.target.value })} /></label>
          <label>Tanggal upload<input className="input" type="date" min={bookingDraft.visitDate || undefined} disabled={pendingRows.includes(String(editingBooking.id))} value={bookingDraft.uploadDate} onChange={(event) => setBookingDraft({ ...bookingDraft, uploadDate: event.target.value })} /></label>
           {displayInfluencerBookingStatus(editingBooking.status) === "Selesai" && <label className="wide">Link konten<input className="input" type="url" inputMode="url" value={bookingDraft.contentLink} disabled={pendingRows.includes(String(editingBooking.id))} onChange={(event) => setBookingDraft({ ...bookingDraft, contentLink: event.target.value })} placeholder="https://instagram.com/..." aria-describedby="campaign-content-link-help" /><small id="campaign-content-link-help" className="campaign-booking-field-help">Tambahkan URL konten yang sudah dipublikasikan.</small></label>}
          <label className="wide">Catatan<textarea className="input" rows={3} disabled={pendingRows.includes(String(editingBooking.id))} value={bookingDraft.notes} onChange={(event) => setBookingDraft({ ...bookingDraft, notes: event.target.value })} placeholder="Catatan untuk jadwal ini" /></label>
        </div>
        {bookingEditError && <div className="campaign-form-error" role="alert">{bookingEditError}</div>}
        <p className="campaign-booking-locked-note">Identitas influencer, rate, spent, dan status pembayaran dikunci di form ini. Status pembayaran dapat diubah lewat dropdown pada daftar jadwal.</p>
        <div className="modal-actions"><button type="button" className="button button-soft" disabled={pendingRows.includes(String(editingBooking.id))} onClick={closeBookingEditor}>Batal</button><button type="submit" className="button button-primary" disabled={pendingRows.includes(String(editingBooking.id))}><Icon name={pendingRows.includes(String(editingBooking.id)) ? "clock" : "check"} size={14} />{pendingRows.includes(String(editingBooking.id)) ? "Menyimpan…" : "Simpan perubahan"}</button></div>
      </form>
    </section></div>}
    {paymentDialogBooking && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pendingRows.includes(String(paymentDialogBooking.id))) setPaymentDialogBooking(null); }}><section className="modal campaign-detail-modal campaign-payment-modal" role="dialog" aria-modal="true" aria-labelledby="campaign-payment-title"><div className="modal-head"><div><h2 id="campaign-payment-title">Catat pembayaran DP</h2><p>{paymentDialogBooking.influencer} · {paymentDialogBooking.themeName || paymentDialogBooking.content}</p></div><button type="button" className="icon-button modal-close" disabled={pendingRows.includes(String(paymentDialogBooking.id))} onClick={() => setPaymentDialogBooking(null)} aria-label="Tutup catatan pembayaran"><Icon name="close" /></button></div><form onSubmit={(event) => void submitDeposit(event)}><div className="campaign-payment-summary"><span>Rate influencer</span><strong>{rupiah(paymentDialogBooking.rate)}</strong><span>Spent saat ini</span><strong>{rupiah(paymentDialogBooking.spent)}</strong></div><label className="campaign-payment-amount-field">Nominal DP<input className="input" type="number" min="1" max={Math.max(paymentDialogBooking.rate - 1, 0)} step="1" required autoFocus value={paymentDraftAmount} onChange={(event) => setPaymentDraftAmount(event.target.value)} placeholder="Masukkan nominal yang dibayar" /></label><p className="campaign-booking-locked-note">Nominal akan otomatis masuk ke Riwayat spent dan menambah realisasi Campaign. Saat status diubah menjadi Lunas, sistem mencatat sisa rate secara otomatis.</p>{paymentError && <div className="campaign-form-error" role="alert">{paymentError}</div>}<div className="modal-actions"><button type="button" className="button button-soft" disabled={pendingRows.includes(String(paymentDialogBooking.id))} onClick={() => setPaymentDialogBooking(null)}>Batal</button><button type="submit" className="button button-primary" disabled={pendingRows.includes(String(paymentDialogBooking.id))}>{pendingRows.includes(String(paymentDialogBooking.id)) ? "Menyimpan…" : "Simpan DP"}</button></div></form></section></div>}
  </div>;
}
