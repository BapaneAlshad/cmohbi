"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AppData, Brand, BrandMenu, EntityId, SocialPlatform, TaskStatus, UserIdentity } from "@/lib/types";
import { Avatar, compact, Icon, PageHeading, PriorityPill, rupiah, StatusPill } from "./ui";
import { CampaignWorkspace } from "./campaign/campaign-workspace";

type CommonProps = {
  data: AppData;
  identity?: UserIdentity;
  openModal: (type: string) => void;
  openResetPin?: (user: AppData["users"][number]) => void;
  navigate: (view: string) => void;
  notify: (message: string) => void;
  notifyAction?: (message: string, actionLabel: string, action: () => void) => void;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  getAccessToken?: () => Promise<string | null>;
  uploadMedia?: (file: File, bucket?: string, prefix?: string) => Promise<string>;
  workspaceId?: string;
  refreshData?: () => Promise<void>;
  liveMode?: boolean;
  campaignLifecycleAction?: (campaignId: EntityId, action: "archive" | "unarchive" | "trash" | "restore" | "permanent-delete", pin?: string) => Promise<void>;
  requestedCampaignId?: string | null;
  onCampaignOpened?: () => void;
};

function PrimaryAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button className="button button-primary" onClick={onClick}><Icon name="plus" size={15} />{children}</button>;
}

function CampaignRow({ campaign }: { campaign: AppData["campaigns"][number] }) {
  return <div className="campaign-row"><div className="campaign-brand">{campaign.brand === "HBI" ? "H" : "HB"}</div><div className="campaign-copy"><strong>{campaign.name}</strong><span>{campaign.brand} · {campaign.status}</span></div><div className="campaign-progress-wrap"><div className={`progress-track ${campaign.tasks ? "" : "empty"}`}><span style={{ width: campaign.tasks ? `${campaign.progress}%` : "0%" }} /></div><div className="progress-meta"><span>{campaign.tasks ? `${campaign.progress}% selesai` : "Belum ada tugas"}</span><span>{campaign.kpi || "KPI belum ditentukan"}</span></div></div><div className="campaign-budget"><strong>{campaign.budget ? rupiah(campaign.budget - campaign.spent) : "Belum diatur"}</strong><span>sisa budget</span></div></div>;
}

function dashboardGreeting(date: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(date));
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}

function dashboardDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date);
}

export function DashboardView({ data, navigate, identity }: CommonProps) {
  const [clock, setClock] = useState({ greeting: "Selamat pagi", date: "Hari ini" });
  const activeCampaigns = data.campaigns.filter((item) => (item.lifecycleStatus || "active") === "active");
  const active = activeCampaigns.filter((item) => item.status === "Berjalan").length;
  const pending = data.tasks.filter((item) => item.status !== "Done").length;
  const latest = latestByPlatform(data);
  const followers = Object.values(latest).reduce((sum, item) => sum + (item?.followers ?? 0), 0);
  const reach = Object.values(latest).reduce((sum, item) => sum + (item?.reach ?? 0), 0);
  const engagement = average(Object.values(latest).map((item) => item?.engagementRate ?? 0));
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClock({ greeting: dashboardGreeting(now), date: dashboardDate(now) });
    };
    updateClock();
    const interval = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(interval);
  }, []);
  const accountName = identity?.name || "Andi";
  return <>
    <div className="dashboard-toolbar"><strong className="dashboard-greeting">{clock.greeting}, {accountName}</strong><span className="date-chip"><Icon name="calendar" size={14} />{clock.date}</span></div>
    <section className="hero-panel"><div className="hero-copy"><div className="eyebrow">Ringkasan hari ini</div><h2>Tim kamu punya {pending} tugas yang perlu perhatian.</h2><p>Campaign, konten, dan performa sosial media tersaji dalam satu workspace.</p></div><div className="hero-illustration"><div className="hero-orb" /><div className="hero-person" /><div className="hero-board"><i /><i /><i /></div></div></section>
    <section className="stats-grid">
      <StatCard label="Campaign aktif" value={`${active} / ${activeCampaigns.length}`} note="12% dari bulan lalu" progress={68} icon="campaign" />
      <StatCard label="Tugas tertunda" value={`${pending} tugas`} note="4 perlu perhatian" progress={42} icon="check-square" tone="orange" />
      <StatCard label="Akun sosial" value={`${data.socialAccounts.length} platform`} note="2 tersinkron hari ini" progress={72} icon="users" tone="blue" />
      <StatCard label="Butuh approval" value="3 item" note="2 item baru hari ini" progress={56} icon="alert" tone="coral" />
    </section>
    <section className="dashboard-grid">
      <div className="card"><div className="card-header"><div><h2 className="card-title">Progres Campaign</h2><p className="card-subtitle">Campaign yang sedang berjalan</p></div><button className="link-button" onClick={() => navigate("campaigns")}>Kelola campaign ↗</button></div>{activeCampaigns.slice(0, 3).map((campaign) => <CampaignRow campaign={campaign} key={campaign.id} />)}</div>
      <div className="card social-card"><div className="card-header"><div><h2 className="card-title">KPI Sosial Media</h2><p className="card-subtitle">Instagram, Facebook, Threads, dan TikTok</p></div><button className="link-button" onClick={() => navigate("analytics")}>Lihat analitik ↗</button></div>
        <MetricRow label="Followers" value={compact(followers)} target="320K" positive change="+4,8%" />
        <MetricRow label="Reach" value={compact(reach)} target="750K" positive change="+12,4%" />
        <MetricRow label="Engagement" value={`${engagement.toFixed(1)}%`} target="5%" positive={engagement >= 5} change={engagement >= 5 ? "+0,6%" : "-0,4%"} />
      </div>
    </section>
  </>;
}

function StatCard({ label, value, note, progress, icon, tone = "" }: { label: string; value: string; note: string; progress: number; icon: string; tone?: string }) { return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}><Icon name={icon} size={15} /></span></div><div className="stat-value">{value}</div><div className={`stat-note ${tone === "orange" || tone === "coral" ? "trend-down" : "trend-up"}`}>{note}</div><div className="stat-progress"><span style={{ width: `${progress}%` }} /></div></div>; }
function MetricRow({ label, value, target, positive, change }: { label: string; value: string; target: string; positive: boolean; change: string }) { return <div className="metric-row"><div className="metric-label"><i className="metric-dot purple" />{label}</div><div className="metric-value">{value} <small>/ {target}</small></div><div className="metric-bar"><span style={{ width: positive ? "83%" : "69%" }} /></div><div className={`metric-change ${positive ? "trend-up" : "trend-down"}`}>{positive ? "↗" : "↘"} {change}<em className={`goal-label ${positive ? "goal-ok" : "goal-low"}`}>{positive ? "On track" : "Di bawah"}</em></div></div>; }
function AlertItem({ icon, title, sub, time, tone = "orange" }: { icon: string; title: string; sub: string; time: string; tone?: string }) { return <div className="alert-item"><div className={`alert-icon ${tone}`}><Icon name={icon} size={15} /></div><div className="alert-copy"><strong>{title}</strong><span>{sub}</span></div><span className="alert-time">{time}</span></div>; }
function Schedule({ day, title, meta }: { day: string; title: string; meta: string }) { return <div className="schedule-item"><div className="schedule-date"><strong>{day}</strong><span>Okt</span></div><div className="schedule-copy"><strong>{title}</strong><span>{meta}</span></div><i className="schedule-status" /></div>; }
function displayDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

const campaignMonths: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, jun: 5, jul: 6, agu: 7, sep: 8, okt: 9, nov: 10, des: 11 };

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function parseTaskDeadline(task: AppData["tasks"][number]) {
  if (task.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)) return new Date(`${task.dueDate}T00:00:00`);
  const due = task.due.trim().toLowerCase();
  const today = startOfDay(new Date());
  if (due === "hari ini") return today;
  if (due === "besok") return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const match = due.match(/^(\d{1,2})\s+([a-z]+)/);
  const month = match ? campaignMonths[match[2].slice(0, 3)] : undefined;
  if (match && month !== undefined) return new Date(today.getFullYear(), month, Number(match[1]));
  return null;
}

function campaignDeadline(tasks: AppData["tasks"][number][]) {
  const datedTasks = tasks.map((task) => ({ task, date: parseTaskDeadline(task) })).filter((item): item is { task: AppData["tasks"][number]; date: Date } => item.date !== null).sort((left, right) => left.date.getTime() - right.date.getTime());
  if (!datedTasks.length) return { label: "Belum ada", meta: "Deadline belum tersedia", tone: "muted" };
  const today = startOfDay(new Date());
  const next = datedTasks.find((item) => item.date >= today) || datedTasks[datedTasks.length - 1];
  const dayDiff = Math.round((startOfDay(next.date).getTime() - today.getTime()) / 86_400_000);
  const dateLabel = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(next.date);
  if (dayDiff < 0) return { label: "Terlambat", meta: dateLabel, tone: "danger" };
  if (dayDiff === 0) return { label: "Hari ini", meta: dateLabel, tone: "warning" };
  if (dayDiff === 1) return { label: "Besok", meta: dateLabel, tone: "warning" };
  return { label: dateLabel, meta: `${dayDiff} hari lagi`, tone: "muted" };
}

function activeCampaignPhase(status: string) {
  const phaseByStatus: Record<string, string> = { Rencana: "Persiapan", Berjalan: "Eksekusi", "Hampir selesai": "Finalisasi", "Butuh perhatian": "Perlu tindak lanjut", Selesai: "Penutupan" };
  return phaseByStatus[status] || null;
}

export function BrandView({ data, identity, navigate, notify, setData, uploadMedia, workspaceId }: CommonProps) {
  const brands = data.brands || [];
  const [selectedId, setSelectedId] = useState<EntityId | null>(brands[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [brandDialog, setBrandDialog] = useState<Brand | null | undefined>(undefined);
  const [menuDialog, setMenuDialog] = useState<{ brand: Brand; menu?: BrandMenu } | null>(null);
  const canEdit = !identity?.accessRole || identity.accessRole !== "viewer";
  const selectedBrand = brands.find((brand) => String(brand.id) === String(selectedId));
  const filteredBrands = brands.filter((brand) => `${brand.name} ${brand.description} ${brand.targetCustomer}`.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    if (selectedBrand || !brands.length) return;
    setSelectedId(brands[0].id);
  }, [brands, selectedBrand]);

  const saveBrand = (nextBrand: Brand) => {
    setData((current) => ({ ...current, brands: current.brands.some((brand) => String(brand.id) === String(nextBrand.id)) ? current.brands.map((brand) => String(brand.id) === String(nextBrand.id) ? nextBrand : brand) : [nextBrand, ...current.brands] }));
    setSelectedId(nextBrand.id);
    setBrandDialog(undefined);
    notify(`Brand ${nextBrand.name} berhasil disimpan.`);
  };
  const saveMenu = (nextMenu: BrandMenu) => {
    if (!menuDialog) return;
    setData((current) => ({ ...current, brands: current.brands.map((brand) => String(brand.id) !== String(menuDialog.brand.id) ? brand : { ...brand, menus: brand.menus.some((menu) => String(menu.id) === String(nextMenu.id)) ? brand.menus.map((menu) => String(menu.id) === String(nextMenu.id) ? nextMenu : menu) : [...brand.menus, nextMenu] }) }));
    setMenuDialog(null);
    notify(`Menu ${nextMenu.name} berhasil disimpan.`);
  };
  const removeMenu = (brand: Brand, menu: BrandMenu) => {
    if (!canEdit || !window.confirm(`Hapus menu ${menu.name} dari ${brand.name}?`)) return;
    setData((current) => ({ ...current, brands: current.brands.map((item) => String(item.id) === String(brand.id) ? { ...item, menus: item.menus.filter((itemMenu) => String(itemMenu.id) !== String(menu.id)) } : item) }));
    notify(`Menu ${menu.name} dihapus.`);
  };

  if (!selectedBrand) return <><PageHeading kicker="Workspace / Brand" title="Pusat brand" description="Simpan identitas brand sekali, lalu gunakan sebagai acuan campaign, tugas, dan pengeluaran." action={canEdit ? <PrimaryAction onClick={() => setBrandDialog(null)}>Tambah brand</PrimaryAction> : undefined} /><div className="card brand-empty-state"><div className="brand-empty-icon"><Icon name="book" size={22} /></div><strong>Belum ada brand</strong><p>Tambahkan brand pertama agar pilihan brand di Campaign, To-Do, dan Keuangan lebih konsisten.</p>{canEdit && <button className="button button-primary" onClick={() => setBrandDialog(null)}><Icon name="plus" size={14} />Tambah brand</button>}</div>{brandDialog !== undefined && <BrandDialog brand={brandDialog} onClose={() => setBrandDialog(undefined)} onSave={saveBrand} uploadMedia={uploadMedia} workspaceId={workspaceId} />}</>;

  const brandCampaigns = data.campaigns.filter((campaign) => campaign.brand === selectedBrand.name && (campaign.lifecycleStatus || "active") !== "trashed");
  const brandTasks = data.tasks.filter((task) => task.brand === selectedBrand.name && task.status !== "Done");
  const brandTransactions = data.transactions.filter((transaction) => transaction.brand === selectedBrand.name);
  const totalSpend = brandTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const marginAverage = selectedBrand.menus.length ? selectedBrand.menus.reduce((sum, menu) => sum + marginPercent(menu), 0) / selectedBrand.menus.length : 0;

  return <>
    <PageHeading kicker="Workspace / Brand" title="Pusat brand" description="Satu sumber informasi untuk menjaga campaign, tugas, dan pengeluaran tetap sesuai identitas brand." action={canEdit ? <PrimaryAction onClick={() => setBrandDialog(selectedBrand)}>Tambah brand</PrimaryAction> : undefined} />
    <div className="brand-page-layout">
      <aside className="brand-directory card">
        <div className="brand-directory-head"><div><h2>Daftar brand</h2><span>{brands.length} brand tersimpan</span></div><button className="icon-button" onClick={() => setBrandDialog(null)} disabled={!canEdit} aria-label="Tambah brand"><Icon name="plus" size={15} /></button></div>
        <label className="brand-search"><Icon name="search" size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari brand..." aria-label="Cari brand" /></label>
        <div className="brand-directory-list">{filteredBrands.length ? filteredBrands.map((brand) => <button type="button" className={`brand-directory-item ${String(brand.id) === String(selectedBrand.id) ? "active" : ""}`} key={brand.id} onClick={() => setSelectedId(brand.id)}><BrandAvatar brand={brand} /><span><strong>{brand.name}</strong><small>{brand.menus.length} menu · {data.campaigns.filter((campaign) => campaign.brand === brand.name).length} campaign</small></span><Icon name="chevron-right" size={14} /></button>) : <span className="brand-directory-empty">Brand tidak ditemukan.</span>}</div>
      </aside>
      <main className="brand-detail-stack">
        <section className="card brand-detail-hero"><div className="brand-detail-heading"><BrandAvatar brand={selectedBrand} large /><div><div className="eyebrow">Profil brand</div><h2>{selectedBrand.name}</h2><p>{selectedBrand.openingDate ? `Dibuka pertama kali ${displayDate(selectedBrand.openingDate)}` : "Tanggal opening belum diisi"}</p></div></div><div className="brand-detail-actions"><button className="button button-soft" onClick={() => navigate("campaigns")}><Icon name="campaign" size={14} />Campaign</button><button className="button button-soft" onClick={() => navigate("todo")}><Icon name="check-square" size={14} />To-Do</button><button className="button button-soft" onClick={() => navigate("partners")}><Icon name="wallet" size={14} />Keuangan</button>{canEdit && <button className="button button-primary" onClick={() => setBrandDialog(selectedBrand)}><Icon name="edit" size={14} />Edit brand</button>}</div></section>
        <div className="brand-stat-grid"><BrandMetric label="Campaign" value={String(brandCampaigns.length)} note="aktif & arsip" icon="campaign" /><BrandMetric label="Tugas terbuka" value={String(brandTasks.length)} note="perlu perhatian" icon="check-square" tone="amber" /><BrandMetric label="Pengeluaran" value={rupiah(totalSpend)} note="berdasarkan transaksi" icon="wallet" tone="green" /><BrandMetric label="Margin menu" value={selectedBrand.menus.length ? `${Math.round(marginAverage)}%` : "—"} note="rata-rata" icon="chart" tone="purple" /></div>
        <div className="brand-info-grid"><section className="card brand-copy-card"><BrandSectionTitle icon="info" title="Identitas & arah brand" /><InfoBlock label="Deskripsi singkat" value={selectedBrand.description} /><InfoBlock label="Target customer" value={selectedBrand.targetCustomer} /><div className="brand-copy-columns"><InfoBlock label="Visi" value={selectedBrand.vision} /><InfoBlock label="Misi" value={selectedBrand.mission} /></div></section><section className="card brand-assets-card"><BrandSectionTitle icon="image" title="Aset visual" description="Logo dan suasana outlet yang mudah dirujuk tim." /><div className="brand-asset-grid"><BrandAsset label="Logo brand" url={selectedBrand.logoUrl} /><BrandAsset label="Tampilan outlet" url={selectedBrand.outletImageUrl} /></div></section></div>
        <section className="card brand-menu-card"><BrandSectionTitle icon="book" title="Menu yang dijual" description="HPP dan harga jual menjadi dasar perhitungan margin." action={canEdit && <button className="button button-soft button-sm" onClick={() => setMenuDialog({ brand: selectedBrand })}><Icon name="plus" size={13} />Tambah menu</button>} />{selectedBrand.menus.length ? <div className="brand-menu-table"><div className="brand-menu-row brand-menu-head"><span>Menu</span><span>HPP</span><span>Harga jual</span><span>Margin</span><span /></div>{selectedBrand.menus.map((menu) => <div className="brand-menu-row" key={menu.id}><strong>{menu.name}</strong><span>{rupiah(menu.hpp)}</span><span>{rupiah(menu.sellingPrice)}</span><span className={marginAmount(menu) < 0 ? "negative" : "positive"}>{rupiah(marginAmount(menu))}<small>{marginPercent(menu).toFixed(1)}%</small></span><span className="brand-menu-actions">{canEdit && <><button className="icon-button" onClick={() => setMenuDialog({ brand: selectedBrand, menu })} aria-label={`Edit ${menu.name}`}><Icon name="edit" size={13} /></button><button className="icon-button" onClick={() => removeMenu(selectedBrand, menu)} aria-label={`Hapus ${menu.name}`}><Icon name="trash" size={13} /></button></>}</span></div>)}</div> : <div className="brand-inline-empty"><Icon name="book" size={18} /><span>Belum ada menu. Tambahkan HPP dan harga jual agar margin dapat dihitung otomatis.</span></div>}</section>
        <section className="card brand-links-card"><BrandSectionTitle icon="link" title="Link penting" description="Simpan referensi yang sering dibutuhkan saat membuat brief dan mengeksekusi campaign." /><div className="brand-link-grid"><BrandLink label="Website brand" url={selectedBrand.websiteUrl} icon="external" /><BrandLink label="Proposal" url={selectedBrand.proposalUrl} icon="book" /><BrandLink label="Data penting" url={selectedBrand.importantDataUrl} icon="link" /></div></section>
        <section className="card brand-usage-card"><BrandSectionTitle icon="layers" title="Dipakai di workspace" description="Data di bawah ini mengambil sumber existing berdasarkan nama brand." /><div className="brand-usage-grid"><BrandUsage label="Campaign terbaru" empty="Belum ada campaign untuk brand ini." items={brandCampaigns.slice(0, 4).map((campaign) => `${campaign.name} · ${campaign.status}`)} onClick={() => navigate("campaigns")} /><BrandUsage label="Tugas terbuka" empty="Belum ada tugas terbuka untuk brand ini." items={brandTasks.slice(0, 4).map((task) => `${task.title} · ${task.due}`)} onClick={() => navigate("todo")} /><BrandUsage label="Pengeluaran terakhir" empty="Belum ada transaksi untuk brand ini." items={brandTransactions.slice(0, 4).map((transaction) => `${transaction.vendor} · ${rupiah(transaction.amount)}`)} onClick={() => navigate("partners")} /></div></section>
      </main>
    </div>
    {brandDialog !== undefined && <BrandDialog brand={brandDialog} onClose={() => setBrandDialog(undefined)} onSave={saveBrand} uploadMedia={uploadMedia} workspaceId={workspaceId} />}
    {menuDialog && <BrandMenuDialog menu={menuDialog.menu} onClose={() => setMenuDialog(null)} onSave={saveMenu} />}
  </>;
}

function BrandAvatar({ brand, large = false }: { brand: Brand; large?: boolean }) {
  return <span className={`brand-avatar ${large ? "large" : ""}`}>{brand.logoUrl ? <img src={brand.logoUrl} alt={`Logo ${brand.name}`} /> : brand.name.slice(0, 2).toUpperCase()}</span>;
}

function BrandMetric({ label, value, note, icon, tone = "blue" }: { label: string; value: string; note: string; icon: string; tone?: string }) {
  return <div className="brand-metric"><span className={`brand-metric-icon ${tone}`}><Icon name={icon} size={15} /></span><small>{label}</small><strong>{value}</strong><span>{note}</span></div>;
}

function BrandSectionTitle({ icon, title, description, action }: { icon: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="brand-section-title"><div><h2><Icon name={icon} size={16} />{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

function InfoBlock({ label, value }: { label: string; value?: string | null }) {
  return <div className="brand-info-block"><small>{label}</small><p>{value?.trim() || "Belum diisi."}</p></div>;
}

function BrandAsset({ label, url }: { label: string; url?: string | null }) {
  return <div className="brand-asset"><div className="brand-asset-preview">{url ? <img src={url} alt={label} /> : <Icon name="image" size={22} />}</div><strong>{label}</strong><small>{url ? "Tersedia" : "Belum diunggah"}</small></div>;
}

function BrandLink({ label, url, icon }: { label: string; url?: string | null; icon: string }) {
  return url ? <a className="brand-link-item" href={url} target="_blank" rel="noreferrer"><span><Icon name={icon} size={16} /></span><strong>{label}</strong><small>Buka link <Icon name="external" size={10} /></small></a> : <div className="brand-link-item empty"><span><Icon name={icon} size={16} /></span><strong>{label}</strong><small>Belum diisi</small></div>;
}

function BrandUsage({ label, items, empty, onClick }: { label: string; items: string[]; empty: string; onClick: () => void }) {
  return <div className="brand-usage"><div className="brand-usage-head"><strong>{label}</strong><button className="button button-ghost button-sm" onClick={onClick}>Lihat semua <Icon name="arrow-right" size={11} /></button></div>{items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{empty}</p>}</div>;
}

function marginAmount(menu: BrandMenu) { return menu.sellingPrice - menu.hpp; }
function marginPercent(menu: BrandMenu) { return menu.sellingPrice > 0 ? (marginAmount(menu) / menu.sellingPrice) * 100 : 0; }

function BrandDialog({ brand, onClose, onSave, uploadMedia, workspaceId }: { brand: Brand | null; onClose: () => void; onSave: (brand: Brand) => void; uploadMedia?: CommonProps["uploadMedia"]; workspaceId?: string }) {
  const [form, setForm] = useState(() => ({ id: brand?.id || globalThis.crypto.randomUUID(), name: brand?.name || "", openingDate: brand?.openingDate || "", description: brand?.description || "", targetCustomer: brand?.targetCustomer || "", vision: brand?.vision || "", mission: brand?.mission || "", logoUrl: brand?.logoUrl || "", outletImageUrl: brand?.outletImageUrl || "", websiteUrl: brand?.websiteUrl || "", proposalUrl: brand?.proposalUrl || "", importantDataUrl: brand?.importantDataUrl || "" }));
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState("");
  const setField = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const uploadImage = async (field: "logoUrl" | "outletImageUrl", file: File) => {
    if (!uploadMedia || !workspaceId) return setError("Upload gambar membutuhkan koneksi Supabase aktif. Anda tetap bisa memasukkan URL gambar.");
    setUploading(field);
    try { setField(field, await uploadMedia(file, "brand-assets", `${workspaceId}/${form.id}`)); } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Upload gambar gagal."); } finally { setUploading(""); }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = form.name.trim();
    if (!nextName) return setError("Nama brand wajib diisi.");
    for (const [label, value] of [["Website", form.websiteUrl], ["Proposal", form.proposalUrl], ["Data penting", form.importantDataUrl]] as const) if (value && !/^https?:\/\//i.test(value)) return setError(`${label} harus diawali http:// atau https://.`);
    onSave({ id: form.id, name: nextName, openingDate: form.openingDate || null, description: form.description.trim(), targetCustomer: form.targetCustomer.trim(), vision: form.vision.trim(), mission: form.mission.trim(), logoUrl: form.logoUrl.trim() || null, outletImageUrl: form.outletImageUrl.trim() || null, websiteUrl: form.websiteUrl.trim() || null, proposalUrl: form.proposalUrl.trim() || null, importantDataUrl: form.importantDataUrl.trim() || null, menus: brand?.menus || [] });
  };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal brand-dialog" role="dialog" aria-modal="true" aria-labelledby="brand-dialog-title"><div className="modal-head"><div><h2 id="brand-dialog-title">{brand ? "Edit brand" : "Tambah brand"}</h2><p>Isi informasi inti yang perlu dipahami tim sebelum membuat campaign.</p></div><button type="button" className="icon-button modal-close" onClick={onClose} aria-label="Tutup"><Icon name="close" /></button></div><form className="form-stack" onSubmit={submit}><div className="two-fields"><BrandTextField label="Nama brand" value={form.name} onChange={(value) => setField("name", value)} required placeholder="Contoh: HBI" /><BrandTextField label="Tanggal dibuat / opening pertama" type="date" value={form.openingDate} onChange={(value) => setField("openingDate", value)} /></div><BrandTextArea label="Deskripsi singkat" value={form.description} onChange={(value) => setField("description", value)} placeholder="Brand ini bergerak di bidang apa dan apa yang membuatnya berbeda?" /><BrandTextArea label="Target customer" value={form.targetCustomer} onChange={(value) => setField("targetCustomer", value)} placeholder="Siapa audiens utama, kebiasaan, kebutuhan, atau areanya?" /><div className="two-fields"><BrandTextArea label="Visi" value={form.vision} onChange={(value) => setField("vision", value)} placeholder="Arah jangka panjang brand" /><BrandTextArea label="Misi" value={form.mission} onChange={(value) => setField("mission", value)} placeholder="Cara brand mencapai visi" /></div><div className="brand-dialog-assets"><BrandImageField label="Gambar logo" value={form.logoUrl} uploading={uploading === "logoUrl"} onChange={(value) => setField("logoUrl", value)} onFile={(file) => void uploadImage("logoUrl", file)} /><BrandImageField label="Tampilan outlet" value={form.outletImageUrl} uploading={uploading === "outletImageUrl"} onChange={(value) => setField("outletImageUrl", value)} onFile={(file) => void uploadImage("outletImageUrl", file)} /></div><div className="brand-dialog-links"><BrandTextField label="Link website" type="url" value={form.websiteUrl} onChange={(value) => setField("websiteUrl", value)} placeholder="https://..." /><BrandTextField label="Link proposal" type="url" value={form.proposalUrl} onChange={(value) => setField("proposalUrl", value)} placeholder="https://..." /><BrandTextField label="Link data penting" type="url" value={form.importantDataUrl} onChange={(value) => setField("importantDataUrl", value)} placeholder="https://..." /></div>{error && <div className="campaign-form-error" role="alert"><Icon name="alert" size={14} />{error}</div>}<div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>Batal</button><button type="submit" className="button button-primary">Simpan brand</button></div></form></section></div>;
}

function BrandMenuDialog({ menu, onClose, onSave }: { menu?: BrandMenu; onClose: () => void; onSave: (menu: BrandMenu) => void }) {
  const [form, setForm] = useState({ id: menu?.id || globalThis.crypto.randomUUID(), name: menu?.name || "", hpp: menu?.hpp ? String(menu.hpp) : "", sellingPrice: menu?.sellingPrice ? String(menu.sellingPrice) : "" });
  const [error, setError] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const hpp = Number(form.hpp); const sellingPrice = Number(form.sellingPrice); if (!form.name.trim()) return setError("Nama menu wajib diisi."); if (!Number.isFinite(hpp) || hpp < 0 || !Number.isFinite(sellingPrice) || sellingPrice < 0) return setError("HPP dan harga jual harus berupa angka nol atau lebih."); onSave({ id: form.id, name: form.name.trim(), hpp, sellingPrice }); };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal brand-menu-dialog" role="dialog" aria-modal="true" aria-labelledby="menu-dialog-title"><div className="modal-head"><div><h2 id="menu-dialog-title">{menu ? "Edit menu" : "Tambah menu"}</h2><p>Margin dihitung otomatis dari harga jual dikurangi HPP.</p></div><button type="button" className="icon-button modal-close" onClick={onClose} aria-label="Tutup"><Icon name="close" /></button></div><form className="form-stack" onSubmit={submit}><BrandTextField label="Nama menu" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} required placeholder="Contoh: Paket Bento" /><div className="two-fields"><BrandTextField label="HPP" type="number" value={form.hpp} onChange={(value) => setForm((current) => ({ ...current, hpp: value }))} required placeholder="0" /><BrandTextField label="Harga jual" type="number" value={form.sellingPrice} onChange={(value) => setForm((current) => ({ ...current, sellingPrice: value }))} required placeholder="0" /></div>{form.hpp && form.sellingPrice && <div className={`brand-margin-preview ${Number(form.sellingPrice) - Number(form.hpp) < 0 ? "negative" : ""}`}>Margin: <strong>{rupiah(Number(form.sellingPrice) - Number(form.hpp))}</strong> · {Number(form.sellingPrice) > 0 ? ((Number(form.sellingPrice) - Number(form.hpp)) / Number(form.sellingPrice) * 100).toFixed(1) : "0.0"}%</div>}{error && <div className="campaign-form-error" role="alert"><Icon name="alert" size={14} />{error}</div>}<div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>Batal</button><button type="submit" className="button button-primary">Simpan menu</button></div></form></section></div>;
}

function BrandTextField({ label, value, onChange, type = "text", required = false, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string }) { return <div className="form-field"><label>{label}{required ? " *" : ""}</label><input className="modal-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} placeholder={placeholder} /></div>; }
function BrandTextArea({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <div className="form-field"><label>{label}</label><textarea className="modal-input brand-dialog-textarea" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={1000} /></div>; }
function BrandImageField({ label, value, onChange, onFile, uploading }: { label: string; value: string; onChange: (value: string) => void; onFile: (file: File) => void; uploading: boolean }) { return <div className="form-field"><label>{label}</label><div className="brand-image-input"><input className="modal-input" type="url" value={value} onChange={(event) => onChange(event.target.value)} placeholder="https://..." /><label className="button button-soft button-sm"><Icon name="image" size={13} />{uploading ? "Mengunggah…" : "Upload"}<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.currentTarget.value = ""; }} /></label></div></div>; }

export function CampaignsView({ data, identity, openModal, navigate, notify, notifyAction, setData, getAccessToken, uploadMedia, workspaceId, campaignLifecycleAction, requestedCampaignId, onCampaignOpened }: CommonProps) {
  const [selectedCampaignId, setSelectedCampaignId] = useState<EntityId | null>(null);
  const [filters, setFilters] = useState({ status: "Semua", brand: "Semua" });
  const [section, setSection] = useState<"active" | "archived" | "trashed">("active");
  const [menuId, setMenuId] = useState<EntityId | null>(null);
  const [dialog, setDialog] = useState<{ type: "trash" | "restore" | "permanent"; campaign: AppData["campaigns"][number] } | null>(null);
  const [pending, setPending] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const selectedCampaign = selectedCampaignId === null ? undefined : data.campaigns.find((campaign) => String(campaign.id) === String(selectedCampaignId));
  const campaignsBySection = data.campaigns.filter((campaign) => (campaign.lifecycleStatus || "active") === section);
  const statuses = ["Semua", ...Array.from(new Set(campaignsBySection.map((campaign) => campaign.status)))];
  const brands = ["Semua", ...Array.from(new Set(campaignsBySection.map((campaign) => campaign.brand)))];
  const filtered = campaignsBySection.filter((campaign) => (filters.status === "Semua" || campaign.status === filters.status) && (filters.brand === "Semua" || campaign.brand === filters.brand));
  const archivedCount = data.campaigns.filter((campaign) => campaign.lifecycleStatus === "archived").length;
  const trashedCount = data.campaigns.filter((campaign) => campaign.lifecycleStatus === "trashed").length;
  const canManage = identity?.accessRole === "owner" || identity?.accessRole === "admin";
  const canPermanentlyDelete = canManage && ["cmo", "super admin"].includes(String(identity?.role || "").trim().toLowerCase());

  useEffect(() => {
    if (!requestedCampaignId) return;
    const campaign = data.campaigns.find((item) => String(item.id) === requestedCampaignId && (item.lifecycleStatus || "active") === "active");
    if (!campaign) return;
    setSection("active");
    setSelectedCampaignId(campaign.id);
    onCampaignOpened?.();
  }, [data.campaigns, onCampaignOpened, requestedCampaignId]);

  const runLifecycle = async (campaign: AppData["campaigns"][number], action: "archive" | "unarchive" | "trash" | "restore" | "permanent-delete", pin?: string) => {
    if (!campaignLifecycleAction) return notify("Lifecycle Campaign belum tersedia.");
    setPending(true);
    setDialogError("");
    try {
      await campaignLifecycleAction(campaign.id, action, pin);
      setDialog(null);
      setMenuId(null);
      if (action === "archive") {
        const undo = () => void runLifecycle(campaign, "unarchive");
        if (notifyAction) notifyAction("Campaign berhasil diarsipkan.", "Undo", undo);
        else notify("Campaign berhasil diarsipkan.");
      } else notify(action === "unarchive" ? "Campaign dikembalikan ke daftar aktif." : action === "trash" ? "Campaign dipindahkan ke daftar Dihapus." : action === "restore" ? `Campaign dipulihkan ke ${campaign.previousLifecycleStatus === "archived" ? "Arsip" : "daftar aktif"}.` : "Campaign berhasil dihapus permanen.");
      if (selectedCampaignId !== null && action !== "unarchive") setSelectedCampaignId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Perubahan lifecycle Campaign gagal.";
      if (dialog) setDialogError(message); else notify(message);
    } finally {
      setPending(false);
    }
  };

  if (selectedCampaignId !== null) return <CampaignWorkspace campaign={selectedCampaign} data={data} identity={identity} readOnly={selectedCampaign?.lifecycleStatus === "archived"} error={selectedCampaign && selectedCampaign.lifecycleStatus !== "trashed" ? undefined : "Campaign yang dihapus tidak dapat dibuka."} onBack={() => setSelectedCampaignId(null)} onNavigate={navigate} setData={setData} notify={notify} getAccessToken={getAccessToken} uploadMedia={uploadMedia} workspaceId={workspaceId} onLifecycleAction={(action) => selectedCampaign && runLifecycle(selectedCampaign, action)} />;

  return <><PageHeading kicker="Workspace / Campaign" title={section === "active" ? "Kelola campaign" : section === "archived" ? "Campaign diarsipkan" : "Campaign dihapus"} description={section === "active" ? "Pantau strategi dan progres semua campaign HBI." : section === "archived" ? "Buka histori campaign dalam mode baca saja atau aktifkan kembali." : "Pulihkan campaign atau hapus permanen setelah dependency aman."} action={<div className="campaign-heading-actions"><PrimaryAction onClick={() => openModal("campaign")}>Buat campaign</PrimaryAction><div className="campaign-lifecycle-links"><button className={`button button-outline button-sm ${section === "archived" ? "active" : ""}`} onClick={() => { setSection(section === "archived" ? "active" : "archived"); setFilters({ status: "Semua", brand: "Semua" }); }}><Icon name="archive" size={14} />Campaign Diarsipkan <span>{archivedCount}</span></button><button className={`button button-outline button-sm ${section === "trashed" ? "active" : ""}`} onClick={() => { setSection(section === "trashed" ? "active" : "trashed"); setFilters({ status: "Semua", brand: "Semua" }); }}><Icon name="trash" size={14} />Campaign Dihapus <span>{trashedCount}</span></button></div></div>} />
    <div className="toolbar"><div className="toolbar-left"><span className="result-count">{filtered.length} campaign ditemukan</span><FilterSelect value={filters.status} values={statuses} onChange={(status) => setFilters((current) => ({ ...current, status }))} /><FilterSelect value={filters.brand} values={brands} onChange={(brand) => setFilters((current) => ({ ...current, brand }))} /></div>{(filters.status !== "Semua" || filters.brand !== "Semua") && <button className="button button-soft button-sm" onClick={() => setFilters({ status: "Semua", brand: "Semua" })}>Reset filter</button>}</div>
    {filtered.length ? <div className="campaign-grid">{filtered.map((campaign) => {
      const campaignTasks = data.tasks.filter((task) => String(task.campaign) === String(campaign.id));
      const activeTaskCount = campaignTasks.filter((task) => task.status !== "Done").length;
      const linkedContentCount = data.influencerSchedules.filter((schedule) => schedule.campaignId != null ? String(schedule.campaignId) === String(campaign.id) : schedule.campaign === campaign.name).length;
      const phase = activeCampaignPhase(campaign.status);
      const deadline = campaignDeadline(campaignTasks);
      const hasTasks = campaignTasks.length > 0;
      return <article className={`card campaign-card ${section === "trashed" ? "campaign-card-trashed" : ""}`} key={campaign.id}><div className="campaign-card-top"><div className="campaign-card-brand"><div className="campaign-brand">{campaign.brand === "HBI" ? "H" : "HB"}</div><div><h3>{campaign.name}</h3><div className="meta">{campaign.brand} · {campaign.period}</div></div></div><div className="campaign-card-controls"><StatusPill status={section === "archived" ? "Diarsipkan" : section === "trashed" ? "Dihapus" : campaign.status} className="campaign-status-chip" />{canManage && section !== "trashed" && <div className="campaign-action-wrap"><button className="icon-button campaign-more" onClick={() => setMenuId(String(menuId) === String(campaign.id) ? null : campaign.id)} aria-label={`Aksi ${campaign.name}`}><Icon name="more-horizontal" size={15} /></button>{String(menuId) === String(campaign.id) && <div className="campaign-action-menu">{section === "active" ? <button onClick={() => void runLifecycle(campaign, "archive")}><Icon name="archive" size={14} />Arsipkan Campaign</button> : <button onClick={() => void runLifecycle(campaign, "unarchive")}><Icon name="restore" size={14} />Buka Arsip</button>}<button className="danger" onClick={() => { setDialog({ type: "trash", campaign }); setDialogError(""); }}><Icon name="trash" size={14} />Hapus Campaign</button></div>}</div>}</div></div><div className="campaign-card-body">{phase && <div className="campaign-phase-line"><Icon name="layers" size={13} /><span>{section === "archived" ? "Fase terakhir" : "Fase aktif"}</span><strong>{phase}</strong></div>}<div className={`campaign-progress-block ${hasTasks ? "" : "empty"}`}><div className="campaign-progress-heading"><span>Progress campaign</span><strong>{hasTasks ? `${campaign.progress}% selesai` : "Belum ada tugas"}</strong></div><div className="progress-track"><span style={{ width: hasTasks ? `${campaign.progress}%` : "0%" }} /></div></div><div className="campaign-kpis"><MiniKpi label="Tugas aktif" value={`${activeTaskCount}`} /><MiniKpi label="Konten/KOL" value={`${linkedContentCount}`} />{section === "trashed" ? <MiniKpi label="Dihapus" value={campaign.deletedAt ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(campaign.deletedAt)) : "Tanggal tidak tersedia"} /> : <MiniKpi label="Deadline" value={deadline.label} meta={deadline.meta} tone={deadline.tone} />}</div></div><div className="campaign-card-footer"><span className="campaign-kpi-summary"><Icon name="target" size={13} /><span><small>KPI utama</small><strong>{campaign.kpi || "Belum ditentukan"}</strong></span></span>{section === "trashed" ? <div className="campaign-trash-actions"><button className="button button-soft button-sm" onClick={() => { setDialog({ type: "restore", campaign }); setDialogError(""); }}><Icon name="restore" size={13} />Pulihkan</button>{canPermanentlyDelete && <button className="button button-danger button-sm" onClick={() => { setDialog({ type: "permanent", campaign }); setDialogError(""); }}><Icon name="trash" size={13} />Hapus Selamanya</button>}</div> : <button className="campaign-open-label" onClick={() => setSelectedCampaignId(campaign.id)}>Buka workspace <Icon name="arrow-right" size={12} /></button>}</div></article>;
    })}</div> : <div className="card campaign-list-empty"><Icon name="campaign" size={20} /><strong>Campaign tidak ditemukan</strong><p>Ubah filter atau buat campaign baru untuk mulai bekerja.</p></div>}
    {dialog && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setDialog(null); }}><section className="modal campaign-lifecycle-dialog" role="dialog" aria-modal="true" aria-labelledby="campaign-lifecycle-title"><div className="modal-head"><div><h2 id="campaign-lifecycle-title">{dialog.type === "trash" ? "Hapus Campaign?" : dialog.type === "restore" ? "Pulihkan Campaign?" : "Hapus Campaign selamanya?"}</h2><p>{dialog.type === "permanent" ? "Tindakan ini tidak dapat dibatalkan." : "Data tugas, KPI, konten, dan keuangan tetap tersimpan."}</p></div><button className="icon-button modal-close" onClick={() => setDialog(null)} disabled={pending}><Icon name="close" /></button></div><div className="campaign-dialog-name"><Icon name={dialog.type === "restore" ? "restore" : "trash"} size={17} /><div><span>Campaign</span><strong>{dialog.campaign.name}</strong></div></div>{dialog.type === "permanent" && <><div className="campaign-danger-notice"><Icon name="alert" size={16} /><span>Server akan memeriksa role CMO, PIN login, tugas, dan jadwal influencer sebelum menghapus.</span></div><div className="form-field"><label>PIN keamanan CMO</label><input className="modal-input" name="securityPin" form="permanent-delete-form" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoFocus /></div></>}{dialogError && <div className="auth-message" role="alert">{dialogError}</div>}<form id="permanent-delete-form" onSubmit={(event) => { event.preventDefault(); const pin = String(new FormData(event.currentTarget).get("securityPin") || ""); void runLifecycle(dialog.campaign, dialog.type === "trash" ? "trash" : dialog.type === "restore" ? "restore" : "permanent-delete", pin); }}><div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setDialog(null)} disabled={pending}>Batal</button><button type="submit" className={`button ${dialog.type === "restore" ? "button-primary" : "button-danger"}`} disabled={pending}>{pending ? "Memproses…" : dialog.type === "trash" ? "Pindahkan ke Dihapus" : dialog.type === "restore" ? "Pulihkan Campaign" : "Hapus Selamanya"}</button></div></form></section></div>}
  </>;
}
function MiniKpi({ label, value, meta, tone = "" }: { label: string; value: string; meta?: string; tone?: string }) { return <div className={`mini-kpi ${tone ? `mini-kpi-${tone}` : ""}`}><strong>{value}</strong><span>{meta || label}</span></div>; }

function brandNames(data: AppData) {
  return Array.from(new Set((data.brands?.length ? data.brands.map((brand) => brand.name) : [
    ...data.campaigns.map((item) => item.brand),
    ...data.content.map((item) => item.brand),
    ...data.requests.map((item) => item.brand),
    ...data.transactions.map((item) => item.brand),
  ]).map((brand) => brand.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right, "id"));
}

export function TodoView({ data, openModal, setData, notify }: CommonProps) {
  const [filters, setFilters] = useState({ brand: "Semua", pic: "Semua", priority: "Semua" });
  const statuses: TaskStatus[] = ["Backlog", "To Do", "In Progress", "Review", "Revisi", "Done"];
  const activeCampaignIds = new Set(data.campaigns.filter((campaign) => (campaign.lifecycleStatus || "active") === "active").map((campaign) => String(campaign.id)));
  const filtered = data.tasks.filter((task) => (task.campaign === null || activeCampaignIds.has(String(task.campaign))) && (filters.brand === "Semua" || task.brand === filters.brand) && (filters.pic === "Semua" || task.pic === filters.pic) && (filters.priority === "Semua" || task.priority === filters.priority));
  const updateStatus = (id: EntityId, status: TaskStatus) => { setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, status } : task) })); notify(`Status tugas dipindahkan ke ${status}.`); };
  return <><PageHeading kicker="Workspace / To-Do" title="Papan kerja tim" description="Semua tugas tersusun rapi, setiap progres terlihat jelas." action={<PrimaryAction onClick={() => openModal("task")}>Tambah tugas</PrimaryAction>} />
    <div className="toolbar"><div className="toolbar-left"><span className="result-count">Filter tugas:</span><FilterSelect value={filters.brand} values={["Semua", ...brandNames(data)]} onChange={(brand) => setFilters({ ...filters, brand })} /><FilterSelect value={filters.pic} values={["Semua", ...data.users.map((user) => user.name)]} onChange={(pic) => setFilters({ ...filters, pic })} /><FilterSelect value={filters.priority} values={["Semua", "Tinggi", "Sedang", "Rendah"]} onChange={(priority) => setFilters({ ...filters, priority })} /></div><button className="button button-soft button-sm" onClick={() => setFilters({ brand: "Semua", pic: "Semua", priority: "Semua" })}>Reset filter</button></div>
    <div className="todo-board">{statuses.map((status) => { const tasks = filtered.filter((task) => task.status === status); return <section className="todo-column" key={status}><div className="todo-column-head"><h3>{status}</h3><span>{tasks.length}</span></div><div className="todo-stack">{tasks.length ? tasks.map((task) => <article className="task-card" key={task.id}><div className="task-card-top"><h4>{task.title}</h4><Icon name="more-horizontal" size={14} /></div><div className="task-brand">{task.brand} · <PriorityPill priority={task.priority} /></div><div className="task-meta"><span className="task-due">{task.due}</span><div className="task-assignee"><Avatar name={task.pic} /></div></div><select aria-label={`Status ${task.title}`} className="task-status-select" value={task.status} onChange={(event) => updateStatus(task.id, event.target.value as TaskStatus)}>{statuses.map((option) => <option key={option}>{option}</option>)}</select></article>) : <div className="empty-column">Belum ada tugas</div>}</div></section>; })}</div>
  </>;
}
function FilterSelect({ value, values, onChange }: { value: string; values: string[]; onChange: (value: string) => void }) { return <label className="filter-chip"><Icon name="filter" size={13} /><select className="select-clean" value={value} onChange={(event) => onChange(event.target.value)}>{values.map((item) => <option key={item}>{item}</option>)}</select></label>; }

export function CalendarView({ data, openModal }: CommonProps) {
  const days = Array.from({ length: 35 }, (_, index) => index - 2);
  return <><PageHeading kicker="Operasional / Kalender Konten" title="Kalender konten" description="Rencanakan konten Instagram, Facebook, dan TikTok secara terarah." action={<PrimaryAction onClick={() => openModal("content")}>Jadwalkan konten</PrimaryAction>} />
    <div className="calendar-layout"><div className="card calendar-card"><div className="calendar-header"><div className="month-title">Oktober 2026<span>{data.content.length} konten terjadwal</span></div><div className="month-actions"><button className="icon-button"><Icon name="chevron-left" /></button><button className="icon-button"><Icon name="chevron-right" /></button></div></div><div className="calendar-week">{["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{days.map((day, index) => { const valid = day > 0 && day <= 31; const item = data.content.find((entry) => entry.date === day); return <div className={`calendar-cell ${!valid ? "muted" : ""} ${day === 10 ? "today" : ""}`} key={index}><span className="day-number">{valid ? day : day <= 0 ? 30 + day : day - 31}</span>{item && <span className={`calendar-event ${item.platform === "TikTok" ? "orange" : item.platform === "Facebook" ? "green" : ""}`}>{item.title}</span>}</div>; })}</div></div>
      <div className="card"><div className="card-header"><div><h2 className="card-title">Momen relevan</h2><p className="card-subtitle">Peluang konten bulan ini</p></div></div><div className="moment-list"><Moment date="10" title="Hari Kesehatan Mental" meta="Instagram · Edukasi" /><Moment date="16" title="Hari Pangan Sedunia" meta="Facebook · Brand story" /><Moment date="28" title="Hari Sumpah Pemuda" meta="TikTok · Short video" /></div></div></div>
  </>;
}
function Moment({ date, title, meta }: { date: string; title: string; meta: string }) { return <div className="moment-item"><div className="moment-date">{date}</div><div className="moment-copy"><strong>{title}</strong><span>{meta}</span></div><Icon name="chevron-right" size={14} /></div>; }

export function RequestsView({ data, openModal, notify }: CommonProps) {
  return <><PageHeading kicker="Operasional / Request & Ide" title="Request & ide" description="Tangkap setiap masukan dan ubah ide baik menjadi pekerjaan nyata." action={<PrimaryAction onClick={() => openModal("request")}>Buat request</PrimaryAction>} />
    <div className="request-layout"><div className="card"><div className="card-header"><div><h2 className="card-title">Request terbaru</h2><p className="card-subtitle">Masukan dari tim dan stakeholder</p></div></div><div className="request-list">{data.requests.map((request) => <div className="request-item" key={request.id}><div className="request-symbol">{request.icon}</div><div className="request-copy"><strong>{request.title}</strong><span>{request.sender} · {displayDate(request.date)}</span></div><div className="request-end"><PriorityPill priority={request.priority} /><StatusPill status={request.status} /></div></div>)}</div></div>
      <div className="card suggestion-card"><div className="suggestion-hero"><div className="suggestion-hero-icon"><Icon name="sparkles" /></div><div><strong>Kotak Saran Marketing</strong><span>Kirim ide singkat untuk dibahas bersama tim.</span></div></div><form className="form-stack" onSubmit={(event) => { event.preventDefault(); event.currentTarget.reset(); notify("Terima kasih, saran kamu sudah dikirim."); }}><div className="form-field"><label>Nama</label><input className="input" required /></div><div className="form-field"><label>Saran</label><textarea className="textarea" required /></div><button className="button button-primary" type="submit"><Icon name="send" size={14} />Kirim saran</button></form></div></div>
  </>;
}

export function PartnersView({ data, openModal }: CommonProps) {
  const [tab, setTab] = useState<"influencers" | "finance">("influencers");
  const [financeBrand, setFinanceBrand] = useState("Semua");
  const financeTransactions = data.transactions.filter((item) => financeBrand === "Semua" || item.brand === financeBrand);
  const total = financeTransactions.reduce((sum, item) => sum + item.amount, 0);
  return <><PageHeading kicker="Operasional / Mitra & Keuangan" title="Mitra & keuangan" description="Kelola relasi KOL dan pengeluaran marketing di satu tempat." action={<PrimaryAction onClick={() => openModal(tab === "influencers" ? "influencer" : "transaction")}>{tab === "influencers" ? "Tambah influencer" : "Catat transaksi"}</PrimaryAction>} />
    <div className="view-tabs partner-tabs"><button className={`view-tab ${tab === "influencers" ? "active" : ""}`} onClick={() => setTab("influencers")}>Daftar influencer</button><button className={`view-tab ${tab === "finance" ? "active" : ""}`} onClick={() => setTab("finance")}>Keuangan & rekap</button></div>
    {tab === "influencers" ? <div className="card table-card"><div className="card-header"><div><h2 className="card-title">Daftar influencer / KOL</h2><p className="card-subtitle">Fokus Instagram, Facebook, dan TikTok</p></div><button className="link-button"><Icon name="download" size={14} />Export data</button></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Influencer</th><th>Platform</th><th>Niche</th><th>Followers</th><th>Engagement</th><th>Rate card</th><th>Status</th></tr></thead><tbody>{data.influencers.map((item, index) => <tr key={item.name}><td><div className="table-person"><Avatar name={item.name} tone={index % 2 ? "orange" : "purple"} /><span>{item.name}</span></div></td><td>{item.platform}</td><td>{item.niche}</td><td>{item.followers}</td><td className="trend-up">{item.engagement}</td><td>{rupiah(item.rate)}</td><td><StatusPill status={item.status} /></td></tr>)}</tbody></table></div></div> : <><div className="toolbar finance-filter-toolbar"><div className="toolbar-left"><span className="result-count">Pengeluaran berdasarkan brand</span><FilterSelect value={financeBrand} values={["Semua", ...brandNames(data)]} onChange={setFinanceBrand} /></div></div><section className="partner-summary"><div className="card summary-mini"><span>Total pengeluaran Oktober</span><strong>{rupiah(total)}</strong><p>↗ 8,4% dari bulan lalu</p></div><div className="card summary-mini"><span>Sudah dibayar</span><strong>{rupiah(financeTransactions.filter((item) => item.status === "Sudah Dibayar").reduce((sum, item) => sum + item.amount, 0))}</strong><p>Realisasi berjalan</p></div><div className="card summary-mini"><span>Belum dibayar</span><strong>{rupiah(financeTransactions.filter((item) => item.status !== "Sudah Dibayar").reduce((sum, item) => sum + item.amount, 0))}</strong><p className="trend-down">Perlu diproses</p></div></section><div className="card table-card"><div className="card-header"><div><h2 className="card-title">Transaksi terbaru</h2><p className="card-subtitle">{financeBrand === "Semua" ? "Semua brand" : financeBrand} · rencana dan realisasi biaya</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Vendor</th><th>Kategori</th><th>Tanggal</th><th>Jumlah</th><th>Tipe</th><th>Status</th></tr></thead><tbody>{financeTransactions.map((item) => <tr key={`${item.vendor}-${item.date}`}><td>{item.vendor}<small>{item.brand}</small></td><td>{item.category}</td><td>{displayDate(item.date)}</td><td>{rupiah(item.amount)}</td><td>{item.type}</td><td><StatusPill status={item.status} /></td></tr>)}</tbody></table></div></div></>}
  </>;
}

function influencerDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

export function InfluencerScheduleView({ data, openModal }: CommonProps) {
  const activeCampaigns = data.campaigns.filter((campaign) => (campaign.lifecycleStatus || "active") === "active");
  const activeCampaignIds = new Set(activeCampaigns.map((campaign) => String(campaign.id)));
  const activeCampaignNames = new Set(activeCampaigns.map((campaign) => campaign.name));
  const schedules = data.influencerSchedules.filter((schedule) => schedule.campaign === "Tanpa campaign" || (schedule.campaignId != null ? activeCampaignIds.has(String(schedule.campaignId)) : activeCampaignNames.has(schedule.campaign))).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const totalRate = schedules.reduce((sum, item) => sum + item.rate, 0);
  const totalSpent = schedules.reduce((sum, item) => sum + item.spent, 0);
  const pendingSpent = totalRate - totalSpent;
  const scheduledCount = schedules.filter((item) => item.status === "Terjadwal").length;
  const spentByInfluencer = schedules.reduce<Record<string, number>>((result, item) => {
    result[item.influencer] = (result[item.influencer] || 0) + item.spent;
    return result;
  }, {});
  const topSpent = Object.entries(spentByInfluencer).sort(([, first], [, second]) => second - first).slice(0, 4);

  return <><PageHeading kicker="Operasional / Influencer" title="Jadwal & spent influencer" description="Atur jadwal tayang kerja sama sekaligus pantau rate, realisasi, dan pembayaran selebgram." action={<PrimaryAction onClick={() => openModal("influencerSchedule")}>Jadwalkan influencer</PrimaryAction>} />
    <section className="partner-summary influencer-summary"><div className="card summary-mini"><span>Total rate kerja sama</span><strong>{rupiah(totalRate)}</strong><p>{schedules.length} jadwal tercatat</p></div><div className="card summary-mini"><span>Total spent / realisasi</span><strong>{rupiah(totalSpent)}</strong><p className="trend-up">{totalRate ? `${Math.round((totalSpent / totalRate) * 100)}% dari total rate` : "Belum ada realisasi"}</p></div><div className="card summary-mini"><span>Sisa yang perlu diproses</span><strong>{rupiah(pendingSpent)}</strong><p className="trend-down">{scheduledCount} jadwal mendatang</p></div></section>
    <div className="influencer-schedule-layout"><div className="card table-card"><div className="card-header"><div><h2 className="card-title">Jadwal kerja sama</h2><p className="card-subtitle">Konten, tanggal tayang, dan status pembayaran influencer</p></div><button className="link-button" onClick={() => openModal("influencerSchedule")}><Icon name="plus" size={14} />Tambah jadwal</button></div><div className="table-wrap"><table className="data-table influencer-schedule-table"><thead><tr><th>Tanggal</th><th>Influencer</th><th>Deliverable</th><th>Campaign</th><th>Rate</th><th>Spent</th><th>Status</th><th>Pembayaran</th></tr></thead><tbody>{schedules.map((item) => <tr key={item.id}><td><strong>{influencerDate(item.date)}</strong><small>{item.time} WIB</small></td><td><div className="table-person"><Avatar name={item.influencer} tone={item.platform === "TikTok" ? "orange" : item.platform === "Facebook" ? "green" : "purple"} /><div><strong>{item.influencer}</strong><small>{item.platform}</small></div></div></td><td>{item.content}</td><td>{item.campaign === "Tanpa campaign" ? "—" : item.campaign}</td><td>{rupiah(item.rate)}</td><td className={item.spent > 0 ? "trend-up" : "muted-cell"}>{rupiah(item.spent)}</td><td><StatusPill status={item.status} /></td><td><StatusPill status={item.paymentStatus} /></td></tr>)}</tbody></table></div></div>
      <div className="card influencer-spent-card"><div className="card-header"><div><h2 className="card-title">Spent per influencer</h2><p className="card-subtitle">Akumulasi realisasi kerja sama</p></div><Icon name="wallet" size={16} /></div><div className="spent-list">{topSpent.map(([name, amount]) => { const percentage = totalSpent ? Math.round((amount / totalSpent) * 100) : 0; return <div className="spent-row" key={name}><div className="spent-row-head"><span>{name}</span><strong>{rupiah(amount)}</strong></div><div className="spent-progress"><span style={{ width: `${percentage}%` }} /></div><small>{percentage}% dari total spent</small></div>; })}</div><div className="spent-total"><span>Total spent</span><strong>{rupiah(totalSpent)}</strong></div></div>
    </div>
  </>;
}

const platformMeta: Record<SocialPlatform, { label: string; short: string; color: string }> = {
  instagram: { label: "Instagram", short: "IG", color: "#7469e8" },
  facebook: { label: "Facebook", short: "FB", color: "#4385d7" },
  threads: { label: "Threads", short: "TH", color: "#24262b" },
  tiktok: { label: "TikTok", short: "TT", color: "#24262b" },
};

function latestByPlatform(data: AppData) {
  return (["instagram", "facebook", "threads", "tiktok"] as SocialPlatform[]).reduce((result, platform) => {
    result[platform] = [...data.socialSnapshots].reverse().find((item) => item.platform === platform);
    return result;
  }, {} as Record<SocialPlatform, AppData["socialSnapshots"][number] | undefined>);
}
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }

export function AnalyticsView({ data, openModal, setData, notify, getAccessToken, refreshData, liveMode }: CommonProps) {
  const [platform, setPlatform] = useState<"all" | SocialPlatform>("all");
  const [syncing, setSyncing] = useState(false);
  const latest = latestByPlatform(data);
  const selected = platform === "all" ? Object.values(latest).filter(Boolean) : [latest[platform]].filter(Boolean);
  const totals = { followers: selected.reduce((sum, item) => sum + (item?.followers ?? 0), 0), reach: selected.reduce((sum, item) => sum + (item?.reach ?? 0), 0), impressions: selected.reduce((sum, item) => sum + (item?.impressions ?? 0), 0), views: selected.reduce((sum, item) => sum + (item?.views ?? 0), 0), engagement: average(selected.map((item) => item?.engagementRate ?? 0)) };
  const chartData = useMemo(() => {
    const grouped = new Map<string, Record<string, string | number>>();
    for (const snapshot of data.socialSnapshots) {
      const row = grouped.get(snapshot.date) ?? { date: snapshot.date };
      row[snapshot.platform] = snapshot.reach;
      grouped.set(snapshot.date, row);
    }
    return Array.from(grouped.values()).slice(-14);
  }, [data.socialSnapshots]);
    const sync = async () => { setSyncing(true); try { const token = await getAccessToken?.(); const response = await fetch("/api/social/sync", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : undefined }); const result = await response.json() as { mode?: string; message?: string; error?: string }; if (!response.ok) throw new Error(result.error || result.message || "Sinkronisasi gagal."); await refreshData?.(); notify(result.message ?? "Sinkronisasi selesai."); } catch (error) { notify(error instanceof Error ? error.message : "Sinkronisasi gagal. Periksa koneksi server."); } finally { setSyncing(false); } };
  return <><PageHeading kicker="Operasional / Analitik Sosmed" title="Analitik sosial media" description="Pantau Instagram, Facebook, Threads, dan TikTok dari satu dashboard yang aman." action={<div className="heading-actions"><button className="button button-soft" onClick={() => openModal("metrics")}><Icon name="plus" size={15} />Isi data manual</button><button className="button button-primary" disabled={syncing} onClick={sync}><Icon name="download" size={15} />{syncing ? "Menyinkronkan..." : "Sinkronkan data"}</button></div>} />
    <div className="social-platform-tabs"><button className={`platform-tab ${platform === "all" ? "active" : ""}`} onClick={() => setPlatform("all")}>Semua platform</button>{(["instagram", "facebook", "threads", "tiktok"] as SocialPlatform[]).map((item) => <button className={`platform-tab ${platform === item ? "active" : ""}`} onClick={() => setPlatform(item)} key={item}><span className={`platform-logo ${item}`}>{platformMeta[item].short}</span>{platformMeta[item].label}</button>)}</div>
    <div className="social-account-grid">{data.socialAccounts.map((account) => <article className="card social-account-card" key={account.id}><div className={`platform-logo large ${account.platform}`}>{platformMeta[account.platform].short}</div><div className="social-account-copy"><strong>{account.name}</strong><span>{account.handle}</span><small>Sinkron: {account.lastSync ?? "Belum pernah"}</small></div><div className="social-account-status"><StatusPill status={account.status === "connected" ? "Terhubung" : "Perlu perhatian"} /><strong>{compact(account.followers)}</strong><span>followers</span></div></article>)}</div>
    <div className="analytics-metrics"><AnalyticsMetric label="Followers" value={compact(totals.followers)} change={liveMode ? "Dari provider" : "+4,8%"} icon="users" live={liveMode} /><AnalyticsMetric label="Reach" value={compact(totals.reach)} change={liveMode ? "Snapshot terbaru" : "+12,4%"} icon="target" live={liveMode} /><AnalyticsMetric label="Impressions" value={compact(totals.impressions)} change={liveMode ? "Snapshot terbaru" : "+9,7%"} icon="eye" live={liveMode} /><AnalyticsMetric label="Engagement" value={`${totals.engagement.toFixed(1)}%`} change={liveMode ? "Dihitung dari data" : "+0,6%"} icon="chart" live={liveMode} /><AnalyticsMetric label="Video views" value={compact(totals.views)} change={liveMode ? "Dari provider" : "+18,2%"} icon="campaign" live={liveMode} /></div>
    <div className="analytics-grid"><div className="card analytics-chart-card"><div className="card-header"><div><h2 className="card-title">Perkembangan reach</h2><p className="card-subtitle">Perbandingan performa antar-platform</p></div><span className={`goal-label ${liveMode ? "goal-ok" : "goal-low"}`}>{liveMode ? "Live provider" : "Demo data"}</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs>{Object.entries(platformMeta).map(([key, meta]) => <linearGradient id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1" key={key}><stop offset="5%" stopColor={meta.color} stopOpacity={0.18} /><stop offset="95%" stopColor={meta.color} stopOpacity={0} /></linearGradient>)}</defs><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 10 }} /><YAxis axisLine={false} tickLine={false} tickFormatter={(value) => compact(value)} tick={{ fill: "var(--muted)", fontSize: 10 }} /><Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 11 }} />{Object.entries(platformMeta).map(([key, meta]) => <Area type="monotone" dataKey={key} stroke={meta.color} fill={`url(#fill-${key})`} strokeWidth={2} key={key} />)}</AreaChart></ResponsiveContainer></div></div>
      <div className="card"><div className="card-header"><div><h2 className="card-title">Rekomendasi tindakan</h2><p className="card-subtitle">Insight otomatis dari data terbaru</p></div><span className="goal-label goal-low">2 alert</span></div><div className="recommendation-list"><Recommendation title="TikTok perlu sinkron ulang" text="Perbarui token akses agar data video terbaru tetap masuk otomatis." onClick={() => notify("Pengaturan koneksi TikTok dibuka dalam mode konfigurasi.")} /><Recommendation title="Facebook tertinggal" text="Reach Facebook lebih rendah. Adaptasi tiga konten Instagram terbaik untuk format Facebook." onClick={() => { setData((current) => ({ ...current, tasks: [...current.tasks, { id: globalThis.crypto.randomUUID(), title: "Adaptasi konten terbaik untuk Facebook", brand: "HBI", pic: "Sinta Dewi", due: "14 Okt", priority: "Sedang", status: "To Do", campaign: null }] })); notify("Rekomendasi berhasil dijadikan tugas."); }} /></div></div></div>
    <div className="card social-content-table"><div className="card-header"><div><h2 className="card-title">Konten terbaik</h2><p className="card-subtitle">Diurutkan berdasarkan reach Oktober 2026</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Konten</th><th>Platform</th><th>Tanggal</th><th>Reach</th><th>Engagement</th><th>Status</th></tr></thead><tbody>{data.socialPosts.filter((post) => platform === "all" || post.platform === platform).map((post) => <tr key={post.id}><td><strong>{post.title}</strong></td><td><span className={`platform-badge ${post.platform}`}>{platformMeta[post.platform].label}</span></td><td>{post.publishedAt}</td><td>{compact(post.reach)}</td><td className="trend-up">{post.engagementRate}%</td><td><StatusPill status="Tayang" /></td></tr>)}</tbody></table></div></div>
  </>;
}
function AnalyticsMetric({ label, value, change, icon, live }: { label: string; value: string; change: string; icon: string; live?: boolean }) { return <div className="card analytics-metric"><div className="analytics-metric-top"><span>{label}</span><Icon name={icon} size={16} /></div><strong>{value}</strong><p className={live ? "muted-cell" : "trend-up"}>{live ? change : `↗ ${change} vs periode lalu`}</p><div className="target">{live ? "Data sinkron provider" : "Semua akun terpilih"}</div></div>; }
function Recommendation({ title, text, onClick }: { title: string; text: string; onClick: () => void }) { return <div className="recommendation"><div className="recommendation-top"><strong>{title}</strong><PriorityPill priority="Tinggi" /></div><p>{text}</p><button className="button button-soft button-sm" onClick={onClick}>Jadikan tugas ↗</button></div>; }

export function AccountView({ data, identity = { name: "Andi Saputra", username: "andi.saputra", email: "andi@hbi.co.id", whatsapp: "+6281212345678", role: "CMO" }, openModal, openResetPin, notify }: CommonProps) {
  const initials = identity.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <><PageHeading kicker="Akun / Keamanan" title="Akun & keamanan" description="Kelola profil, tim, dan akses fitur Ngapaya." action={<button className="button button-danger" onClick={() => notify("logout")}><Icon name="log-out" size={15} />Keluar</button>} />
    <div className="account-grid"><div className="card profile-card"><div className="profile-avatar">{initials}</div><h2>{identity.name}</h2><div className="role">{identity.role} · Full access</div><div className="profile-mail">@{identity.username}<br />{identity.email}<br />{identity.whatsapp || "Nomor WhatsApp belum diisi"}</div><button className="button button-soft button-sm" onClick={() => openModal("profile")}>Edit profil</button><div className="profile-stat"><div><strong>{data.campaigns.filter((campaign) => (campaign.lifecycleStatus || "active") === "active").length}</strong><span>Campaign aktif</span></div><div><strong>{data.tasks.filter((task) => task.status === "Done").length}</strong><span>Task selesai</span></div></div><div className="profile-actions"><button className="button button-ghost button-sm" onClick={() => openModal("password")}>Ganti PIN</button><small>PIN login CMO juga dipakai untuk verifikasi hapus permanen dan selalu divalidasi oleh server.</small></div></div>
      <div className="card"><div className="card-header"><div><h2 className="card-title">Kelola pengguna</h2><p className="card-subtitle">Atur peran, akses, dan reset PIN anggota tim.</p></div><button className="button button-primary button-sm" onClick={() => openModal("user")}><Icon name="plus" size={14} />Tambah user</button></div>{data.users.map((user, index) => <div className="permission-row" key={user.username || user.email}><div className="table-person"><Avatar name={user.name} tone={index === 1 ? "green" : "purple"} /><div className="permission-copy"><strong>{user.name}</strong><span>@{user.username} · {user.email} · {user.role}</span></div></div><div className="table-person"><StatusPill status={user.status} />{openResetPin && user.username && <button className="link-button reset-pin-button" onClick={() => openResetPin(user)}>Reset PIN</button>}</div></div>)}</div></div>
  </>;
}
