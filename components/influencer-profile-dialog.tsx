"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Influencer, InfluencerProfileInput, InfluencerRateCard } from "@/lib/types";
import { influencerNiches, influencerRateCardPresets, legacyInfluencerNiches, normalizeWhatsAppNumber } from "@/lib/influencer-profiles";
import { Icon } from "./ui";

type Props = {
  initial?: Influencer;
  onClose: () => void;
  onSave: (input: InfluencerProfileInput, id?: string | number) => Promise<void>;
};

type PackageDraft = InfluencerRateCard & { rowKey: string };

function newPackage(): PackageDraft {
  return { rowKey: crypto.randomUUID(), name: "", platform: "Instagram", details: "", amount: 0 };
}

export function InfluencerProfileDialog({ initial, onClose, onSave }: Props) {
  const [name, setName] = useState(initial?.name || "");
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp || "");
  const [collaborationType, setCollaborationType] = useState<InfluencerProfileInput["collaborationType"]>(initial?.collaborationType || "Influencer");
  const [niches, setNiches] = useState<string[]>(() => initial?.niches?.length ? initial.niches : legacyInfluencerNiches(initial?.niche));
  const [customNiche, setCustomNiche] = useState(initial?.customNiche || (legacyInfluencerNiches(initial?.niche).includes("Lainnya") ? initial?.niche || "" : ""));
  const [accounts, setAccounts] = useState<InfluencerProfileInput["accounts"]>(() => {
    const existing = initial?.accounts || [];
    return (["Instagram", "TikTok"] as const).map((platform) => existing.find((account) => account.platform === platform) || {
      platform,
      username: initial && initial.platform === platform ? "" : "",
      followers: initial && initial.platform === platform ? Number.parseInt(initial.followers.replace(/\D/g, ""), 10) || 0 : 0,
    });
  });
  const [rateCards, setRateCards] = useState<PackageDraft[]>(() => {
    if (initial?.rateCards?.length) return initial.rateCards.map((item) => ({ ...item, rowKey: String(item.id || crypto.randomUUID()) }));
    return [newPackage()];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const packageValueLabel = collaborationType === "Influencer" ? "Rate paket (Rp)" : "Estimasi nilai barter (Rp)";
  const title = initial ? "Edit data influencer" : "Tambah influencer";
  const activeAccounts = useMemo(() => accounts.filter((item) => item.username?.trim() || item.followers > 0), [accounts]);

  const toggleNiche = (niche: string) => setNiches((current) => current.includes(niche) ? current.filter((item) => item !== niche) : [...current, niche]);
  const updateAccount = (platform: "Instagram" | "TikTok", patch: Partial<InfluencerProfileInput["accounts"][number]>) => {
    setAccounts((current) => current.map((item) => item.platform === platform ? { ...item, ...patch } : item));
  };
  const updatePackage = (rowKey: string, patch: Partial<InfluencerRateCard>) => {
    setRateCards((current) => current.map((item) => item.rowKey === rowKey ? { ...item, ...patch } : item));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    const input: InfluencerProfileInput = {
      name,
      whatsapp: normalizeWhatsAppNumber(whatsapp),
      collaborationType,
      niches,
      customNiche,
      accounts: activeAccounts,
      rateCards: rateCards.map(({ rowKey: _rowKey, ...item }) => item),
    };
    try {
      await onSave(input, initial?.id);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Data influencer gagal disimpan.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="modal influencer-profile-modal" role="dialog" aria-modal="true" aria-labelledby="influencer-profile-title">
      <div className="modal-head"><div><h2 id="influencer-profile-title">{title}</h2><p>Kelola jenis kolaborasi, akun sosial, niche, dan paket layanan.</p></div><button type="button" className="icon-button modal-close" onClick={onClose} disabled={saving} aria-label="Tutup"><Icon name="close" /></button></div>
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <div className="form-field"><label htmlFor="influencer-name">Nama influencer *</label><input id="influencer-name" className="modal-input" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required placeholder="Contoh: Nadia Kuliner" /></div>
        <div className="form-field"><label htmlFor="influencer-whatsapp">Nomor WhatsApp</label><input id="influencer-whatsapp" className="modal-input" type="tel" inputMode="tel" autoComplete="tel" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} maxLength={30} placeholder="Contoh: +62 812 3456 7890" /><small>Opsional. Nomor dapat diklik dari daftar influencer untuk membuka WhatsApp.</small></div>
        <div className="form-field"><label htmlFor="influencer-kind">Jenis kolaborasi *</label><select id="influencer-kind" className="modal-input" value={collaborationType} onChange={(event) => setCollaborationType(event.target.value as InfluencerProfileInput["collaborationType"])}><option>Influencer</option><option>Barter Endorse</option></select><small>Nilai barter dicatat sebagai estimasi dan tidak masuk realisasi pengeluaran.</small></div>

        <fieldset className="influencer-profile-fieldset"><legend>Niche</legend><div className="influencer-niche-options">{influencerNiches.map((niche) => <label key={niche}><input type="checkbox" checked={niches.includes(niche)} onChange={() => toggleNiche(niche)} /><span>{niche}</span></label>)}</div>{niches.includes("Lainnya") && <input className="modal-input" value={customNiche} onChange={(event) => setCustomNiche(event.target.value)} maxLength={80} placeholder="Tulis niche lainnya" aria-label="Niche lainnya" />}</fieldset>

        <fieldset className="influencer-profile-fieldset"><legend>Akun sosial</legend><div className="influencer-account-grid">{accounts.map((account) => <div className="influencer-account-editor" key={account.platform}>
          <strong>{account.platform}</strong>
          <label>Username<input className="modal-input" value={account.username || ""} onChange={(event) => updateAccount(account.platform, { username: event.target.value })} maxLength={80} placeholder={`@username`} /></label>
          <label>Followers<input className="modal-input" type="number" min="0" max="1000000000" step="1" value={account.followers} onChange={(event) => updateAccount(account.platform, { followers: Number(event.target.value) })} /></label>
        </div>)}</div><small>Isi satu atau kedua platform. Username ditautkan langsung ke profil sosial.</small></fieldset>

        <fieldset className="influencer-profile-fieldset"><legend>Paket rate card</legend><div className="influencer-package-list">{rateCards.map((item, index) => <article className="influencer-package-editor" key={item.rowKey}>
          <div className="influencer-package-heading"><strong>Paket {index + 1}</strong><button type="button" className="button button-ghost button-sm danger-text" onClick={() => setRateCards((current) => current.filter((entry) => entry.rowKey !== item.rowKey))} disabled={rateCards.length === 1 || saving} aria-label={`Hapus paket ${index + 1}`} title={rateCards.length === 1 ? "Minimal satu paket rate card" : "Hapus paket"}><Icon name="trash" size={14} />Hapus</button></div>
          <div className="influencer-package-grid"><label>Nama paket<input className="modal-input" list="influencer-rate-card-presets" value={item.name} onChange={(event) => updatePackage(item.rowKey, { name: event.target.value })} maxLength={100} placeholder="Paid Post, Visit, Mirroring…" required /></label><label>Platform / layanan<select className="modal-input" value={item.platform} onChange={(event) => updatePackage(item.rowKey, { platform: event.target.value as InfluencerRateCard["platform"] })}><option>Instagram</option><option>TikTok</option><option>Lainnya</option></select></label><label className="influencer-package-details">Detail deliverable<textarea className="modal-input" rows={2} value={item.details} onChange={(event) => updatePackage(item.rowKey, { details: event.target.value })} maxLength={2000} placeholder="Contoh: 1 Reels + 3 story" /></label><label>{packageValueLabel}<input className="modal-input" type="number" min="0" max="999999999999" step="1" value={item.amount} onChange={(event) => updatePackage(item.rowKey, { amount: Number(event.target.value) })} required /></label></div>
        </article>)}</div><datalist id="influencer-rate-card-presets">{influencerRateCardPresets.map((preset) => <option value={preset} key={preset} />)}</datalist><button type="button" className="button button-soft button-sm" onClick={() => setRateCards((current) => [...current, newPackage()])} disabled={rateCards.length >= 30 || saving}><Icon name="plus" size={14} />Tambah paket</button></fieldset>

        {error && <div className="campaign-form-error" role="alert">{error}</div>}
        <div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose} disabled={saving}>Batal</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan data"}</button></div>
      </form>
    </section>
  </div>;
}
