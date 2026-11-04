"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SaveCampaign, AppData, CampaignInfluencerActions, Brand, BrandMenu, CampaignKpiInput, CampaignTimelinePhase, EntityId, Influencer, SocialPlatform, TaskPatch, TaskStatus, UserIdentity } from "@/lib/types";
import { Avatar, compact, Icon, PageHeading, PriorityPill, rupiah, StatusPill, TaskPriorityStar } from "./ui";
import { CampaignAvatar } from "./campaign/campaign-primitives";
import { CampaignCardProgress } from "./campaign/campaign-card-progress";
import { CampaignListTimeline } from "./campaign/campaign-list-timeline";
import { useJakartaToday } from "./use-jakarta-today";
import { calendarDay, campaignExecutionProgress, validThemeColor } from "@/lib/campaign-timeline";
import { CampaignWorkspace } from "./campaign/campaign-workspace";
import { campaignPeriodLabel } from "@/lib/campaign-form";
import { formatDisplayDate, formatDisplayDateTime, formatTaskDeadline } from "@/lib/date-format";
import { displayInfluencerBookingStatus, displayInfluencerPaymentStatus, influencerBookingStatusTone, influencerPaymentStatusTone } from "@/lib/campaign-influencer";
import { canManageUsers, accessLevels } from "@/lib/user-management";
import { userAvatarExtension, validateUserAvatar } from "@/lib/user-avatar";
import { TaskAssigneeAvatars, TaskAssigneePicker, taskAssigneeIds, taskAssigneeNames } from "./task-assignees";
import { isMemberDashboard, memberCampaigns, memberDashboardNotes, memberDashboardTasks } from "@/lib/member-dashboard";
import { taskIsPriority } from "@/lib/task-workflow";
import { InfluencerProfileDialog } from "./influencer-profile-dialog";
import { compactFollowerCount, influencerAccountUrl } from "@/lib/influencer-profiles";

export type CommonProps = CampaignInfluencerActions & {
  saveCampaign: SaveCampaign;
  saveCampaignTimeline: (id: EntityId, phaseMode: boolean, phases: CampaignTimelinePhase[]) => Promise<void>;
  openTaskEditor: (id?: EntityId, campaignId?: EntityId) => void;
  decideTaskStatus: (id: EntityId, approve: boolean) => Promise<void>;
  refreshTaskBoard: () => Promise<void>;
  taskBoardError?: string;
  mutateTask: (id: EntityId, patch: TaskPatch) => Promise<void>;
  saveCampaignKpi: (id: EntityId, input: CampaignKpiInput, existingId?: string) => Promise<void>;
  createCampaignExpense: (campaignId: EntityId, input: import("@/lib/types").CampaignExpenseInput) => Promise<void>;
  saveCampaignMembers: (campaignId: EntityId, memberIds: EntityId[]) => Promise<void>;
  createCampaignDiscussionNote: (campaignId: EntityId, body: string, replyTo?: string) => Promise<import("@/lib/types").CampaignDiscussionNote>;
  setCampaignNoteDashboardPin: (campaignId: EntityId, noteId: string, pinned: boolean) => Promise<void>;
  data: AppData;
  identity?: UserIdentity;
  openModal: (type: string) => void;
  openResetPin?: (user: AppData["users"][number]) => void;
  navigate: (view: string) => void;
  notify: (message: string) => void;
  notifyAction?: (message: string, actionLabel: string, action: () => void) => void;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  getAccessToken?: () => Promise<string | null>;
  uploadOwnAvatar?: (file: File) => Promise<string>;
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

function CampaignRow({ campaign, tasks }: { campaign: AppData["campaigns"][number]; tasks: AppData["tasks"] }) {
  const stats = campaignExecutionProgress(campaign, tasks);
  return <div className="campaign-row"><div className="campaign-brand">{campaign.brand === "HBI" ? "H" : "HB"}</div><div className="campaign-copy"><strong>{campaign.name}</strong><span>{campaign.brand} · {campaign.status}</span></div><div className="campaign-progress-wrap"><div className={`progress-track ${stats.total ? "" : "empty"}`}><span style={{ width: stats.total ? `${stats.percentage}%` : "0%" }} /></div><div className="progress-meta"><span>{stats.total ? `${stats.percentage}% selesai` : "Belum ada tugas"}</span><span>{campaign.kpi || "KPI belum ditentukan"}</span></div></div><div className="campaign-budget"><strong>{campaign.budget ? rupiah(campaign.budget - campaign.spent) : "Belum diatur"}</strong><span>sisa budget</span></div></div>;
}

function dashboardGreeting(date: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(date));
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}

function dashboardDate(date: Date) {
  return formatDisplayDate(date);
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
  if (isMemberDashboard(identity)) return <MemberDashboardView data={data} identity={identity} navigate={navigate} />;
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
      <div className="card"><div className="card-header"><div><h2 className="card-title">Progres Campaign</h2><p className="card-subtitle">Campaign yang sedang berjalan</p></div><button className="link-button" onClick={() => navigate("campaigns")}>Kelola campaign ↗</button></div>{activeCampaigns.slice(0, 3).map((campaign) => <CampaignRow campaign={campaign} tasks={data.tasks} key={campaign.id} />)}</div>
      <div className="card social-card"><div className="card-header"><div><h2 className="card-title">KPI Sosial Media</h2><p className="card-subtitle">Instagram, Facebook, Threads, dan TikTok</p></div><button className="link-button" onClick={() => navigate("analytics")}>Lihat analitik ↗</button></div>
        <MetricRow label="Followers" value={compact(followers)} target="320K" positive change="+4,8%" />
        <MetricRow label="Reach" value={compact(reach)} target="750K" positive change="+12,4%" />
        <MetricRow label="Engagement" value={`${engagement.toFixed(1)}%`} target="5%" positive={engagement >= 5} change={engagement >= 5 ? "+0,6%" : "-0,4%"} />
      </div>
    </section>
  </>;
}

function MemberDashboardView({ data, identity, navigate }: { data: AppData; identity?: UserIdentity; navigate: (view: string) => void }) {
  const today = useJakartaToday();
  const greeting = dashboardGreeting(new Date());
  const campaigns = memberCampaigns(data, identity);
  const tasks = memberDashboardTasks(data, identity, today, 5);
  const notes = memberDashboardNotes(data, identity, today);
  const campaignById = new Map(data.campaigns.map((campaign) => [String(campaign.id), campaign]));
  const noteCount = notes.campaign.length + notes.admin.length;
  return <div className="member-dashboard">
    <div className="dashboard-toolbar"><strong className="dashboard-greeting">{greeting}, {identity?.name || "anggota tim"}</strong><span className="date-chip"><Icon name="calendar" size={14} />{formatDisplayDate(today)}</span></div>
    <section className="member-dashboard-grid">
      <section className="card member-dashboard-section">
        <div className="card-header"><div><h2 className="card-title">Campaign aktif</h2><p className="card-subtitle">Campaign yang melibatkan Anda</p></div><span className="member-count">({campaigns.length})</span></div>
        {campaigns.length ? <div className="member-campaign-list">{campaigns.map((campaign) => <button type="button" className="member-campaign-row" key={campaign.id} onClick={() => navigate("campaigns")}><span className="campaign-brand">{campaign.brand === "HBI" ? "H" : campaign.brand.slice(0, 2).toUpperCase()}</span><span><strong>{campaign.name}</strong><small>{campaign.brand} · {campaignPeriodLabel(campaign)}</small></span><StatusPill status={campaign.status} /></button>)}</div> : <div className="member-empty">Belum ada campaign aktif yang melibatkan Anda.</div>}
        <button type="button" className="link-button member-section-link" onClick={() => navigate("campaigns")}>Lihat campaign</button>
      </section>
      <section className="card member-dashboard-section member-task-section">
        <div className="card-header"><div><h2 className="card-title">Tugas Saya <span className="member-count">({tasks.total})</span></h2><p className="card-subtitle">Tugas aktif terdekat</p></div><button type="button" className="link-button" onClick={() => navigate("todo")}>Lihat semua</button></div>
        {tasks.items.length ? <div className="member-task-list">{tasks.items.map(({ task, overdue, nearDeadline }) => {
          const campaign = campaignById.get(String(task.campaign));
          return <article className={`member-task-row ${overdue ? "overdue" : nearDeadline ? "near-deadline" : ""}`} key={task.id}>
            <div className="member-task-main"><TaskPriorityStar active={taskIsPriority(task)} /><div><strong>{task.title}</strong><small>{task.brand}{campaign ? ` · ${campaign.name}` : ""}</small></div></div>
            <div className="member-task-meta"><span className={overdue ? "member-deadline-overdue" : ""}>{overdue ? "Terlambat" : "Deadline"} · {formatTaskDeadline(task, campaign)}</span><StatusPill status={task.status} /></div>
          </article>;
        })}</div> : <div className="member-empty">Tidak ada tugas aktif untuk Anda.</div>}
      </section>
      <section className="card member-dashboard-section member-notes-section">
        <div className="card-header"><div><h2 className="card-title">Catatan penting</h2><p className="card-subtitle">Catatan campaign yang dipin dan pesan untuk Anda</p></div><span className="member-count">({noteCount})</span></div>
        {noteCount ? <div className="member-note-list">
          {notes.admin.map((note) => <article className="member-note-item admin" key={`admin-${note.id}`}><span className="member-note-icon"><Icon name="pin" size={14} /></span><div><strong>{note.title}</strong><p>{note.body}</p><small>Dari Super Admin{note.expiresAt ? ` · Berlaku sampai ${formatDisplayDate(note.expiresAt)}` : ""}</small></div></article>)}
          {notes.campaign.map((note) => { const campaign = campaignById.get(String(note.campaignId)); return <article className="member-note-item" key={`campaign-${note.id}`}><span className="member-note-icon"><Icon name="pin" size={14} /></span><div><strong>{campaign?.name || "Catatan Campaign"}</strong><p>{note.body}</p><small>{note.source === "brief" ? "Brief & Promo" : campaign?.brand || "Campaign"}{note.createdAt ? ` · ${formatDisplayDate(note.createdAt)}` : ""}</small></div></article>; })}
        </div> : <div className="member-empty">Belum ada catatan penting untuk Anda.</div>}
      </section>
    </section>
  </div>;
}

function StatCard({ label, value, note, progress, icon, tone = "" }: { label: string; value: string; note: string; progress: number; icon: string; tone?: string }) { return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}><Icon name={icon} size={15} /></span></div><div className="stat-value">{value}</div><div className={`stat-note ${tone === "orange" || tone === "coral" ? "trend-down" : "trend-up"}`}>{note}</div><div className="stat-progress"><span style={{ width: `${progress}%` }} /></div></div>; }
function MetricRow({ label, value, target, positive, change }: { label: string; value: string; target: string; positive: boolean; change: string }) { return <div className="metric-row"><div className="metric-label"><i className="metric-dot purple" />{label}</div><div className="metric-value">{value} <small>/ {target}</small></div><div className="metric-bar"><span style={{ width: positive ? "83%" : "69%" }} /></div><div className={`metric-change ${positive ? "trend-up" : "trend-down"}`}>{positive ? "↗" : "↘"} {change}<em className={`goal-label ${positive ? "goal-ok" : "goal-low"}`}>{positive ? "On track" : "Di bawah"}</em></div></div>; }
function AlertItem({ icon, title, sub, time, tone = "orange" }: { icon: string; title: string; sub: string; time: string; tone?: string }) { return <div className="alert-item"><div className={`alert-icon ${tone}`}><Icon name={icon} size={15} /></div><div className="alert-copy"><strong>{title}</strong><span>{sub}</span></div><span className="alert-time">{time}</span></div>; }
function Schedule({ day, title, meta }: { day: string; title: string; meta: string }) { return <div className="schedule-item"><div className="schedule-date"><strong>{day}</strong><span>Okt</span></div><div className="schedule-copy"><strong>{title}</strong><span>{meta}</span></div><i className="schedule-status" /></div>; }
function displayDate(value: string) {
  return formatDisplayDate(value);
}

export function BrandView({ data, identity, navigate, notify, setData, uploadMedia, workspaceId }: CommonProps) {
  const brands = data.brands || [];
  const [selectedId, setSelectedId] = useState<EntityId | null>(brands[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [brandDialog, setBrandDialog] = useState<Brand | null | undefined>(undefined);
  const [menuDialog, setMenuDialog] = useState<{ brand: Brand; menu?: BrandMenu } | null>(null);
  const canEdit = canManageUsers(identity);
  const selectedBrand = brands.find((brand) => String(brand.id) === String(selectedId));
  const filteredBrands = brands.filter((brand) => `${brand.name} ${brand.description} ${brand.targetCustomer}`.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    if (selectedBrand || !brands.length) return;
    setSelectedId(brands[0].id);
  }, [brands, selectedBrand]);

  const saveBrand = (nextBrand: Brand) => {
    if (!canEdit) { notify("Hanya Super Admin yang dapat mengubah data Brand."); return; }
    setData((current) => ({ ...current, brands: current.brands.some((brand) => String(brand.id) === String(nextBrand.id)) ? current.brands.map((brand) => String(brand.id) === String(nextBrand.id) ? nextBrand : brand) : [nextBrand, ...current.brands] }));
    setSelectedId(nextBrand.id);
    setBrandDialog(undefined);
    notify(`Brand ${nextBrand.name} berhasil disimpan.`);
  };
  const saveMenu = (nextMenu: BrandMenu) => {
    if (!canEdit) { notify("Hanya Super Admin yang dapat mengubah menu Brand."); return; }
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

  if (!selectedBrand) return <><PageHeading kicker="Workspace / Brand" title="Pusat brand" description="Simpan identitas brand sekali, lalu gunakan sebagai acuan campaign, tugas, dan pengeluaran." action={canEdit ? <PrimaryAction onClick={() => setBrandDialog(null)}>Tambah brand</PrimaryAction> : undefined} /><div className="card brand-empty-state"><div className="brand-empty-icon"><Icon name="book" size={22} /></div><strong>Belum ada brand</strong><p>{canEdit ? "Tambahkan brand pertama agar pilihan brand di Campaign, To-Do, dan Keuangan lebih konsisten." : "Belum ada data brand yang tersedia di workspace ini."}</p>{canEdit && <button className="button button-primary" onClick={() => setBrandDialog(null)}><Icon name="plus" size={14} />Tambah brand</button>}</div>{canEdit && brandDialog !== undefined && <BrandDialog brand={brandDialog} onClose={() => setBrandDialog(undefined)} onSave={saveBrand} uploadMedia={uploadMedia} workspaceId={workspaceId} />}</>;

  const brandCampaigns = data.campaigns.filter((campaign) => campaign.brand === selectedBrand.name && (campaign.lifecycleStatus || "active") !== "trashed");
  const brandTasks = data.tasks.filter((task) => task.brand === selectedBrand.name && task.status !== "Done");
  const brandTransactions = data.transactions.filter((transaction) => transaction.brand === selectedBrand.name);
  const totalSpend = brandTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const marginAverage = selectedBrand.menus.length ? selectedBrand.menus.reduce((sum, menu) => sum + marginPercent(menu), 0) / selectedBrand.menus.length : 0;

  return <>
    <PageHeading kicker="Workspace / Brand" title="Pusat brand" description="Satu sumber informasi untuk menjaga campaign, tugas, dan pengeluaran tetap sesuai identitas brand." action={canEdit ? <PrimaryAction onClick={() => setBrandDialog(selectedBrand)}>Tambah brand</PrimaryAction> : undefined} />
    <div className="brand-page-layout">
      <aside className="brand-directory card">
        <div className="brand-directory-head"><div><h2>Daftar brand</h2><span>{brands.length} brand tersimpan</span></div>{canEdit && <button className="icon-button" onClick={() => setBrandDialog(null)} aria-label="Tambah brand"><Icon name="plus" size={15} /></button>}</div>
        <label className="brand-search"><Icon name="search" size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari brand..." aria-label="Cari brand" /></label>
        <div className="brand-directory-list">{filteredBrands.length ? filteredBrands.map((brand) => <button type="button" className={`brand-directory-item ${String(brand.id) === String(selectedBrand.id) ? "active" : ""}`} key={brand.id} onClick={() => setSelectedId(brand.id)}><BrandAvatar brand={brand} /><span><strong>{brand.name}</strong><small>{brand.menus.length} menu · {data.campaigns.filter((campaign) => campaign.brand === brand.name).length} campaign</small></span><Icon name="chevron-right" size={14} /></button>) : <span className="brand-directory-empty">Brand tidak ditemukan.</span>}</div>
      </aside>
      <main className="brand-detail-stack">
        <section className="card brand-detail-hero"><div className="brand-detail-heading"><BrandAvatar brand={selectedBrand} large /><div><div className="eyebrow">Profil brand</div><h2>{selectedBrand.name}</h2><p>{selectedBrand.openingDate ? `Dibuka pertama kali ${displayDate(selectedBrand.openingDate)}` : "Tanggal opening belum diisi"}</p></div></div><div className="brand-detail-actions"><button className="button button-soft" onClick={() => navigate("campaigns")}><Icon name="campaign" size={14} />Campaign</button><button className="button button-soft" onClick={() => navigate("todo")}><Icon name="check-square" size={14} />To-Do</button><button className="button button-soft" onClick={() => navigate("partners")}><Icon name="wallet" size={14} />Keuangan</button>{canEdit && <button className="button button-primary" onClick={() => setBrandDialog(selectedBrand)}><Icon name="edit" size={14} />Edit brand</button>}</div></section>
        <div className="brand-stat-grid"><BrandMetric label="Campaign" value={String(brandCampaigns.length)} note="aktif & arsip" icon="campaign" /><BrandMetric label="Tugas terbuka" value={String(brandTasks.length)} note="perlu perhatian" icon="check-square" tone="amber" /><BrandMetric label="Pengeluaran" value={rupiah(totalSpend)} note="berdasarkan transaksi" icon="wallet" tone="green" /><BrandMetric label="Margin menu" value={selectedBrand.menus.length ? `${Math.round(marginAverage)}%` : "—"} note="rata-rata" icon="chart" tone="purple" /></div>
        <div className="brand-info-grid"><section className="card brand-copy-card"><BrandSectionTitle icon="info" title="Identitas & arah brand" /><InfoBlock label="Deskripsi singkat" value={selectedBrand.description} /><InfoBlock label="Target customer" value={selectedBrand.targetCustomer} /><div className="brand-copy-columns"><InfoBlock label="Visi" value={selectedBrand.vision} /><InfoBlock label="Misi" value={selectedBrand.mission} /></div></section><section className="card brand-assets-card"><BrandSectionTitle icon="image" title="Aset visual" description="Logo dan suasana outlet yang mudah dirujuk tim." /><div className="brand-asset-grid"><BrandAsset label="Logo brand" url={selectedBrand.logoUrl} /><BrandAsset label="Tampilan outlet" url={selectedBrand.outletImageUrl} /></div></section></div>
        <section className="card brand-menu-card"><BrandSectionTitle icon="book" title="Menu yang dijual" description="HPP dan harga jual menjadi dasar perhitungan margin." action={canEdit && <button className="button button-soft button-sm" onClick={() => setMenuDialog({ brand: selectedBrand })}><Icon name="plus" size={13} />Tambah menu</button>} />{selectedBrand.menus.length ? <div className="brand-menu-table"><div className="brand-menu-row brand-menu-head"><span>Menu</span><span>HPP</span><span>Harga jual</span><span>Margin</span><span /></div>{selectedBrand.menus.map((menu) => <div className="brand-menu-row" key={menu.id}><strong>{menu.name}</strong><span>{rupiah(menu.hpp)}</span><span>{rupiah(menu.sellingPrice)}</span><span className={marginAmount(menu) < 0 ? "negative" : "positive"}>{rupiah(marginAmount(menu))}<small>{marginPercent(menu).toFixed(1)}%</small></span><span className="brand-menu-actions">{canEdit && <><button className="icon-button" onClick={() => setMenuDialog({ brand: selectedBrand, menu })} aria-label={`Edit ${menu.name}`}><Icon name="edit" size={13} /></button><button className="icon-button" onClick={() => removeMenu(selectedBrand, menu)} aria-label={`Hapus ${menu.name}`}><Icon name="trash" size={13} /></button></>}</span></div>)}</div> : <div className="brand-inline-empty"><Icon name="book" size={18} /><span>Belum ada menu. Tambahkan HPP dan harga jual agar margin dapat dihitung otomatis.</span></div>}</section>
        <section className="card brand-links-card"><BrandSectionTitle icon="link" title="Link penting" description="Simpan referensi yang sering dibutuhkan saat membuat brief dan mengeksekusi campaign." /><div className="brand-link-grid"><BrandLink label="Website brand" url={selectedBrand.websiteUrl} icon="external" /><BrandLink label="Proposal" url={selectedBrand.proposalUrl} icon="book" /><BrandLink label="Data penting" url={selectedBrand.importantDataUrl} icon="link" /></div></section>
        <section className="card brand-usage-card"><BrandSectionTitle icon="layers" title="Dipakai di workspace" description="Data di bawah ini mengambil sumber existing berdasarkan nama brand." /><div className="brand-usage-grid"><BrandUsage label="Campaign terbaru" empty="Belum ada campaign untuk brand ini." items={brandCampaigns.slice(0, 4).map((campaign) => `${campaign.name} · ${campaign.status}`)} onClick={() => navigate("campaigns")} /><BrandUsage label="Tugas terbuka" empty="Belum ada tugas terbuka untuk brand ini." items={brandTasks.slice(0, 4).map((task) => `${task.title} · ${formatTaskDeadline(task, data.campaigns.find((campaign) => String(campaign.id) === String(task.campaign)))}`)} onClick={() => navigate("todo")} /><BrandUsage label="Pengeluaran terakhir" empty="Belum ada transaksi untuk brand ini." items={brandTransactions.slice(0, 4).map((transaction) => `${transaction.vendor} · ${rupiah(transaction.amount)}`)} onClick={() => navigate("partners")} /></div></section>
      </main>
    </div>
    {canEdit && brandDialog !== undefined && <BrandDialog brand={brandDialog} onClose={() => setBrandDialog(undefined)} onSave={saveBrand} uploadMedia={uploadMedia} workspaceId={workspaceId} />}
    {canEdit && menuDialog && <BrandMenuDialog menu={menuDialog.menu} onClose={() => setMenuDialog(null)} onSave={saveMenu} />}
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
  const [form, setForm] = useState(() => ({ primaryColor: brand?.primaryColor || "", id: brand?.id || globalThis.crypto.randomUUID(), name: brand?.name || "", openingDate: brand?.openingDate || "", description: brand?.description || "", targetCustomer: brand?.targetCustomer || "", vision: brand?.vision || "", mission: brand?.mission || "", logoUrl: brand?.logoUrl || "", outletImageUrl: brand?.outletImageUrl || "", websiteUrl: brand?.websiteUrl || "", proposalUrl: brand?.proposalUrl || "", importantDataUrl: brand?.importantDataUrl || "" }));
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
    if (form.primaryColor && !validThemeColor(form.primaryColor)) return setError("Warna utama harus berupa kode HEX enam digit, contoh #2F9D78.");
    for (const [label, value] of [["Website", form.websiteUrl], ["Proposal", form.proposalUrl], ["Data penting", form.importantDataUrl]] as const) if (value && !/^https?:\/\//i.test(value)) return setError(`${label} harus diawali http:// atau https://.`);
    onSave({ primaryColor: form.primaryColor || null, id: form.id, name: nextName, openingDate: form.openingDate || null, description: form.description.trim(), targetCustomer: form.targetCustomer.trim(), vision: form.vision.trim(), mission: form.mission.trim(), logoUrl: form.logoUrl.trim() || null, outletImageUrl: form.outletImageUrl.trim() || null, websiteUrl: form.websiteUrl.trim() || null, proposalUrl: form.proposalUrl.trim() || null, importantDataUrl: form.importantDataUrl.trim() || null, menus: brand?.menus || [] });
  };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal brand-dialog" role="dialog" aria-modal="true" aria-labelledby="brand-dialog-title"><div className="modal-head"><div><h2 id="brand-dialog-title">{brand ? "Edit brand" : "Tambah brand"}</h2><p>Isi informasi inti yang perlu dipahami tim sebelum membuat campaign.</p></div><button type="button" className="icon-button modal-close" onClick={onClose} aria-label="Tutup"><Icon name="close" /></button></div><form className="form-stack" onSubmit={submit}><div className="two-fields"><BrandTextField label="Nama brand" value={form.name} onChange={(value) => setField("name", value)} required placeholder="Contoh: HBI" /><BrandTextField label="Tanggal dibuat / opening pertama" type="date" value={form.openingDate} onChange={(value) => setField("openingDate", value)} /></div><div className="form-field"><label htmlFor="brand-primary-color">Warna utama brand</label><div className="brand-color-input"><input id="brand-primary-color" type="color" aria-label="Pilih warna utama brand" value={validThemeColor(form.primaryColor) ? form.primaryColor : "#64748B"} onChange={(event) => setField("primaryColor", event.target.value)} /><input className="modal-input" aria-label="Kode HEX warna utama brand" placeholder="Netral" value={form.primaryColor} onChange={(event) => setField("primaryColor", event.target.value)} maxLength={7} /><button type="button" className="button button-soft button-sm" onClick={() => setField("primaryColor", "")}>Netral</button></div><small className="brand-color-hint">Dipakai sebagai latar lembut pada kartu Campaign.</small></div><BrandTextArea label="Deskripsi singkat" value={form.description} onChange={(value) => setField("description", value)} placeholder="Brand ini bergerak di bidang apa dan apa yang membuatnya berbeda?" /><BrandTextArea label="Target customer" value={form.targetCustomer} onChange={(value) => setField("targetCustomer", value)} placeholder="Siapa audiens utama, kebiasaan, kebutuhan, atau areanya?" /><div className="two-fields"><BrandTextArea label="Visi" value={form.vision} onChange={(value) => setField("vision", value)} placeholder="Arah jangka panjang brand" /><BrandTextArea label="Misi" value={form.mission} onChange={(value) => setField("mission", value)} placeholder="Cara brand mencapai visi" /></div><div className="brand-dialog-assets"><BrandImageField label="Gambar logo" value={form.logoUrl} uploading={uploading === "logoUrl"} onChange={(value) => setField("logoUrl", value)} onFile={(file) => void uploadImage("logoUrl", file)} /><BrandImageField label="Tampilan outlet" value={form.outletImageUrl} uploading={uploading === "outletImageUrl"} onChange={(value) => setField("outletImageUrl", value)} onFile={(file) => void uploadImage("outletImageUrl", file)} /></div><div className="brand-dialog-links"><BrandTextField label="Link website" type="url" value={form.websiteUrl} onChange={(value) => setField("websiteUrl", value)} placeholder="https://..." /><BrandTextField label="Link proposal" type="url" value={form.proposalUrl} onChange={(value) => setField("proposalUrl", value)} placeholder="https://..." /><BrandTextField label="Link data penting" type="url" value={form.importantDataUrl} onChange={(value) => setField("importantDataUrl", value)} placeholder="https://..." /></div>{error && <div className="campaign-form-error" role="alert"><Icon name="alert" size={14} />{error}</div>}<div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>Batal</button><button type="submit" className="button button-primary">Simpan brand</button></div></form></section></div>;
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

export function CampaignsView({ saveCampaign, saveInfluencerTheme, deleteInfluencerTheme, saveInfluencerBooking, deleteInfluencerBooking, setInfluencerBookingPayment, saveCampaignTimeline, saveCampaignMembers, createCampaignDiscussionNote, setCampaignNoteDashboardPin, createCampaignExpense, data, identity, openModal, navigate, notify, notifyAction, setData, getAccessToken, uploadMedia, workspaceId, campaignLifecycleAction, requestedCampaignId, onCampaignOpened, mutateTask, saveCampaignKpi, liveMode, openTaskEditor }: CommonProps) {
  const today = useJakartaToday();
  const [initialTab, setInitialTab] = useState<"overview" | "timeline">("overview");
  const [selectedCampaignId, setSelectedCampaignId] = useState<EntityId | null>(null);
  const [brandFilter, setBrandFilter] = useState("Semua");
  const [campaignView, setCampaignView] = useState<"cards" | "timeline">("cards");
  const [section, setSection] = useState<"active" | "archived" | "trashed">("active");
  const [menuId, setMenuId] = useState<EntityId | null>(null);
  const [dialog, setDialog] = useState<{ type: "trash" | "restore" | "permanent"; campaign: AppData["campaigns"][number] } | null>(null);
  const [pending, setPending] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const selectedCampaign = selectedCampaignId === null ? undefined : data.campaigns.find((campaign) => String(campaign.id) === String(selectedCampaignId));
  const campaignsBySection = data.campaigns.filter((campaign) => (campaign.lifecycleStatus || "active") === section);
  const brands = ["Semua", ...Array.from(new Set(campaignsBySection.map((campaign) => campaign.brand)))];
  const filtered = campaignsBySection.filter((campaign) => brandFilter === "Semua" || campaign.brand === brandFilter);
  const archivedCount = data.campaigns.filter((campaign) => campaign.lifecycleStatus === "archived").length;
  const trashedCount = data.campaigns.filter((campaign) => campaign.lifecycleStatus === "trashed").length;
  const canManage = identity?.accessRole === "owner" || identity?.accessRole === "admin";
  const canPermanentlyDelete = canManage;

  useEffect(() => {
    if (!requestedCampaignId) return;
    const campaign = data.campaigns.find((item) => String(item.id) === requestedCampaignId && (item.lifecycleStatus || "active") === "active");
    if (!campaign) return;
    setSection("active");
    setInitialTab("overview");
    setSelectedCampaignId(campaign.id);
    onCampaignOpened?.();
  }, [data.campaigns, onCampaignOpened, requestedCampaignId]);

  const runLifecycle = async (campaign: AppData["campaigns"][number], action: "archive" | "unarchive" | "trash" | "restore" | "permanent-delete", pin?: string) => {
    if (!canManage) return notify("Hanya Super Admin dapat mengelola lifecycle Campaign.");
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

  if (selectedCampaignId !== null) return <CampaignWorkspace saveCampaign={saveCampaign} saveInfluencerTheme={saveInfluencerTheme} deleteInfluencerTheme={deleteInfluencerTheme} saveInfluencerBooking={saveInfluencerBooking} deleteInfluencerBooking={deleteInfluencerBooking} setInfluencerBookingPayment={setInfluencerBookingPayment} saveCampaignMembers={saveCampaignMembers} createCampaignDiscussionNote={createCampaignDiscussionNote} setCampaignNoteDashboardPin={setCampaignNoteDashboardPin} createCampaignExpense={createCampaignExpense} initialTab={initialTab} saveCampaignTimeline={saveCampaignTimeline} openTaskEditor={openTaskEditor} mutateTask={mutateTask} saveCampaignKpi={saveCampaignKpi} liveMode={liveMode} campaign={selectedCampaign} data={data} identity={identity} readOnly={selectedCampaign?.lifecycleStatus === "archived"} error={selectedCampaign && selectedCampaign.lifecycleStatus !== "trashed" ? undefined : "Campaign yang dihapus tidak dapat dibuka."} onBack={() => setSelectedCampaignId(null)} onNavigate={navigate} setData={setData} notify={notify} getAccessToken={getAccessToken} uploadMedia={uploadMedia} workspaceId={workspaceId} onLifecycleAction={(action) => selectedCampaign && runLifecycle(selectedCampaign, action)} />;

  return <><PageHeading kicker="Workspace / Campaign" title={section === "active" ? "Campaign Marketing" : section === "archived" ? "Campaign diarsipkan" : "Campaign dihapus"} description={section === "active" ? "Pantau strategi dan progres semua campaign HBI." : section === "archived" ? "Buka histori campaign dalam mode baca saja atau aktifkan kembali." : "Pulihkan campaign atau hapus permanen setelah dependency aman."} action={canManage ? <div className="campaign-heading-actions"><PrimaryAction onClick={() => openModal("campaign")}>Buat campaign</PrimaryAction><div className="campaign-lifecycle-links"><button className={`button button-outline button-sm ${section === "archived" ? "active" : ""}`} onClick={() => { setSection(section === "archived" ? "active" : "archived"); setBrandFilter("Semua"); }}><Icon name="archive" size={14} />Campaign Diarsipkan <span>{archivedCount}</span></button><button className={`button button-outline button-sm ${section === "trashed" ? "active" : ""}`} onClick={() => { setSection(section === "trashed" ? "active" : "trashed"); setBrandFilter("Semua"); }}><Icon name="trash" size={14} />Campaign Dihapus <span>{trashedCount}</span></button></div></div> : undefined} />
    <div className="toolbar campaign-list-toolbar"><div className="toolbar-left"><FilterSelect label="Filter campaign berdasarkan brand" value={brandFilter} values={brands} onChange={setBrandFilter} />{brandFilter !== "Semua" && <button className="button button-soft button-sm" onClick={() => setBrandFilter("Semua")}>Reset filter</button>}</div>{section !== "trashed" && <div className="campaign-view-toggle" role="group" aria-label="Tampilan campaign"><button type="button" aria-pressed={campaignView === "cards"} onClick={() => setCampaignView("cards")}><Icon name="grid" size={14} />Kartu</button><button type="button" aria-pressed={campaignView === "timeline"} onClick={() => setCampaignView("timeline")}><Icon name="timeline" size={14} />Timeline</button></div>}</div>
    {filtered.length ? campaignView === "timeline" && section !== "trashed" ? <CampaignListTimeline campaigns={filtered} brands={data.brands} tasks={data.tasks} today={today} onOpen={(id) => { setInitialTab("overview"); setSelectedCampaignId(id); }} /> : <div className="campaign-grid">{filtered.map((campaign) => {
      const campaignTasks = data.tasks.filter((task) => String(task.campaign) === String(campaign.id));
      const participants = Array.from(new Set(campaignTasks.flatMap((task) => taskAssigneeNames(task, data.users))));
      const deadline = campaignDeadlineCountdown(campaign.endDate, today);
      const brand = data.brands.find((brand) => String(brand.id) === String(campaign.brandId)) || data.brands.find((brand) => brand.name === campaign.brand);
      const brandLogo = brand?.logoUrl;
      return <article style={validThemeColor(brand?.primaryColor) ? { "--campaign-brand-color": brand.primaryColor } as CSSProperties : undefined} className={`card campaign-card ${validThemeColor(brand?.primaryColor) ? "brand-themed" : ""} ${section === "trashed" ? "campaign-card-trashed" : ""}`} key={campaign.id}>
        <div className="campaign-card-top">
          <div className="campaign-card-brand"><CampaignAvatar src={campaign.avatarUrl} fallbackSrc={brandLogo} initials={campaign.brand === "HBI" ? "H" : "HB"} /><div><h3>{campaign.name}</h3><div className="meta">{campaign.brand} · {campaignPeriodLabel(campaign)}</div></div></div>
          <div className="campaign-card-controls"><span className={`campaign-deadline-chip ${deadline.tone}`}><Icon name="clock" size={13} />{section === "trashed" ? "Dihapus" : deadline.label}</span>{canManage && section !== "trashed" && <div className="campaign-action-wrap"><button className="icon-button campaign-more" onClick={() => setMenuId(String(menuId) === String(campaign.id) ? null : campaign.id)} aria-label={`Aksi ${campaign.name}`}><Icon name="more-horizontal" size={15} /></button>{String(menuId) === String(campaign.id) && <div className="campaign-action-menu">{section === "active" ? <button onClick={() => void runLifecycle(campaign, "archive")}><Icon name="archive" size={14} />Arsipkan Campaign</button> : <button onClick={() => void runLifecycle(campaign, "unarchive")}><Icon name="restore" size={14} />Buka Arsip</button>}<button className="danger" onClick={() => { setDialog({ type: "trash", campaign }); setDialogError(""); }}><Icon name="trash" size={14} />Hapus Campaign</button></div>}</div>}</div>
        </div>
        <div className="campaign-card-body">
          <CampaignCardProgress campaign={campaign} tasks={campaignTasks} today={today} onSetDates={canManage && section === "active" ? () => { setInitialTab("timeline"); setSelectedCampaignId(campaign.id); } : undefined} />
        </div>
        <div className="campaign-card-footer">
          {section === "trashed" ? <div className="campaign-trash-actions"><button className="button button-soft button-sm" onClick={() => { setDialog({ type: "restore", campaign }); setDialogError(""); }}><Icon name="restore" size={13} />Pulihkan</button>{canPermanentlyDelete && <button className="button button-danger button-sm" onClick={() => { setDialog({ type: "permanent", campaign }); setDialogError(""); }}><Icon name="trash" size={13} />Hapus Selamanya</button>}</div> : <button className="campaign-open-label" onClick={() => { setInitialTab("overview"); setSelectedCampaignId(campaign.id); }}>Buka workspace <Icon name="arrow-right" size={12} /></button>}
          <CampaignParticipants names={participants} users={data.users} />
        </div>
      </article>;
    })}</div> : <div className="card campaign-list-empty"><Icon name="campaign" size={20} /><strong>Campaign tidak ditemukan</strong><p>Ubah filter atau buat campaign baru untuk mulai bekerja.</p></div>}
    {dialog && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setDialog(null); }}><section className="modal campaign-lifecycle-dialog" role="dialog" aria-modal="true" aria-labelledby="campaign-lifecycle-title"><div className="modal-head"><div><h2 id="campaign-lifecycle-title">{dialog.type === "trash" ? "Hapus Campaign?" : dialog.type === "restore" ? "Pulihkan Campaign?" : "Hapus Campaign selamanya?"}</h2><p>{dialog.type === "permanent" ? "Tindakan ini tidak dapat dibatalkan." : "Data tugas, KPI, konten, dan keuangan tetap tersimpan."}</p></div><button className="icon-button modal-close" onClick={() => setDialog(null)} disabled={pending}><Icon name="close" /></button></div><div className="campaign-dialog-name"><Icon name={dialog.type === "restore" ? "restore" : "trash"} size={17} /><div><span>Campaign</span><strong>{dialog.campaign.name}</strong></div></div>{dialog.type === "permanent" && <><div className="campaign-danger-notice"><Icon name="alert" size={16} /><span>Server akan memeriksa akses Super Admin, PIN login, tugas, dan jadwal influencer sebelum menghapus.</span></div><div className="form-field"><label>PIN keamanan Super Admin</label><input className="modal-input" name="securityPin" form="permanent-delete-form" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoFocus /></div></>}{dialogError && <div className="auth-message" role="alert">{dialogError}</div>}<form id="permanent-delete-form" onSubmit={(event) => { event.preventDefault(); const pin = String(new FormData(event.currentTarget).get("securityPin") || ""); void runLifecycle(dialog.campaign, dialog.type === "trash" ? "trash" : dialog.type === "restore" ? "restore" : "permanent-delete", pin); }}><div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setDialog(null)} disabled={pending}>Batal</button><button type="submit" className={`button ${dialog.type === "restore" ? "button-primary" : "button-danger"}`} disabled={pending}>{pending ? "Memproses…" : dialog.type === "trash" ? "Pindahkan ke Dihapus" : dialog.type === "restore" ? "Pulihkan Campaign" : "Hapus Selamanya"}</button></div></form></section></div>}
  </>;
}
function MiniKpi({ label, value, meta, tone = "", className = "", title }: { label: string; value: string; meta?: string; tone?: string; className?: string; title?: string }) { return <div className={`mini-kpi ${tone ? `mini-kpi-${tone}` : ""} ${className}`}><strong title={title}>{value}</strong><span>{meta || label}</span></div>; }

function campaignDeadlineCountdown(endDate: string | null | undefined, today: string) {
  if (calendarDay(endDate) === null) return { label: "Deadline belum diatur", tone: "unset" };
  const remaining = calendarDay(endDate)! - calendarDay(today)!;
  if (remaining < 0) return { label: "Berakhir", tone: "late" };
  if (remaining === 0) return { label: "Deadline hari ini", tone: "today" };
  return { label: `${remaining} hari lagi`, tone: "upcoming" };
}

function CampaignParticipants({ names, users }: { names: string[]; users: AppData["users"] }) {
  const visibleNames = names.slice(0, 4);
  return <div className="campaign-participants" aria-label={names.length ? `Anggota campaign: ${names.join(", ")}` : "Belum ada anggota campaign"}>
    {visibleNames.map((name) => {
      const avatarUrl = users.find((user) => user.name === name)?.avatarUrl;
      return <span className="campaign-participant-avatar" key={name} title={name}><Avatar name={name} src={avatarUrl} /></span>;
    })}
    {names.length > visibleNames.length && <span className="campaign-participants-more" title={names.slice(4).join(", ")}>+{names.length - 4}</span>}
  </div>;
}

function brandNames(data: AppData) {
  return Array.from(new Set((data.brands?.length ? data.brands.map((brand) => brand.name) : [
    ...data.campaigns.map((item) => item.brand),
    ...data.content.map((item) => item.brand),
    ...data.requests.map((item) => item.brand),
    ...data.transactions.map((item) => item.brand),
  ]).map((brand) => brand.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right, "id"));
}

export { TodoView } from "./todo-board";

function FilterSelect({ label, value, values, onChange }: { label?: string; value: string; values: string[]; onChange: (value: string) => void }) { return <label className="filter-chip"><Icon name="filter" size={13} /><select className="select-clean" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{values.map((item) => <option key={item}>{item}</option>)}</select></label>; }

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
  const [financeBrand, setFinanceBrand] = useState("Semua");
  const financeTransactions = data.transactions.filter((item) => financeBrand === "Semua" || item.brand === financeBrand);
  const total = financeTransactions.reduce((sum, item) => sum + item.amount, 0);
  return <><PageHeading kicker="Operasional / Keuangan" title="Mitra & keuangan" description="Pantau rencana, realisasi, dan pembayaran marketing." action={<PrimaryAction onClick={() => openModal("transaction")}>Catat transaksi</PrimaryAction>} />
    <div className="toolbar finance-filter-toolbar"><div className="toolbar-left"><span className="result-count">Pengeluaran berdasarkan brand</span><FilterSelect value={financeBrand} values={["Semua", ...brandNames(data)]} onChange={setFinanceBrand} /></div></div><section className="partner-summary"><div className="card summary-mini"><span>Total pengeluaran Oktober</span><strong>{rupiah(total)}</strong><p>↗ 8,4% dari bulan lalu</p></div><div className="card summary-mini"><span>Sudah dibayar</span><strong>{rupiah(financeTransactions.filter((item) => item.status === "Sudah Dibayar").reduce((sum, item) => sum + item.amount, 0))}</strong><p>Realisasi berjalan</p></div><div className="card summary-mini"><span>Belum dibayar</span><strong>{rupiah(financeTransactions.filter((item) => item.status !== "Sudah Dibayar").reduce((sum, item) => sum + item.amount, 0))}</strong><p className="trend-down">Perlu diproses</p></div></section><div className="card table-card"><div className="card-header"><div><h2 className="card-title">Transaksi terbaru</h2><p className="card-subtitle">{financeBrand === "Semua" ? "Semua brand" : financeBrand} · rencana dan realisasi biaya</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Vendor</th><th>Kategori</th><th>Tanggal</th><th>Jumlah</th><th>Tipe</th><th>Status</th></tr></thead><tbody>{financeTransactions.map((item) => <tr key={`${item.vendor}-${item.date}`}><td>{item.vendor}<small>{item.brand}</small></td><td>{item.category}</td><td>{displayDate(item.date)}</td><td>{rupiah(item.amount)}</td><td>{item.type}</td><td><StatusPill status={item.status} /></td></tr>)}</tbody></table></div></div>
  </>;
}

export function InfluencersView({ data, saveInfluencerProfile, saveInfluencerBooking, notify, identity }: CommonProps) {
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [editingInfluencer, setEditingInfluencer] = useState<Influencer | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const activeCampaigns = data.campaigns.filter((campaign) => (campaign.lifecycleStatus || "active") === "active");
  const linked = (schedule: AppData["influencerSchedules"][number]) => data.campaigns.some((campaign) => String(campaign.id) === String(schedule.campaignId ?? "") || (!schedule.campaignId && campaign.name === schedule.campaign));
  const unlinked = data.influencerSchedules.filter((schedule) => !linked(schedule));
  const readOnly = identity?.accessRole === "viewer";
  const canEditProfiles = ["owner", "admin", "member"].includes(identity?.accessRole || "");
  const linkToCampaign = async (id: string, campaignId: string) => {
    const campaign = activeCampaigns.find((item) => String(item.id) === campaignId);
    if (!campaign || readOnly || linkingId) return;
    setLinkingId(id);
    try { await saveInfluencerBooking(campaign.id, {}, id); notify("Jadwal lama berhasil ditautkan ke campaign."); }
    catch (error) { notify((error as Error).message); }
    finally { setLinkingId(null); }
  };
  return <><PageHeading kicker="Operasional / Influencer" title="Data Influencer" description="Kelola profil, akun sosial, niche, dan paket layanan untuk campaign." action={canEditProfiles ? <PrimaryAction onClick={() => { setEditingInfluencer(null); setProfileDialogOpen(true); }}>Tambah influencer</PrimaryAction> : undefined} />
    <div className="card table-card"><div className="card-header"><div><h2 className="card-title">Master influencer / KOL</h2><p className="card-subtitle">Pilih paket rate card saat menambahkan jadwal ke Campaign · Instagram dan TikTok</p></div></div><div className="table-wrap"><table className="data-table influencer-master-table"><thead><tr><th>Influencer</th><th>Jenis</th><th>Niche</th><th>Akun sosial &amp; followers</th><th>Paket</th>{canEditProfiles && <th>Aksi</th>}</tr></thead><tbody>{data.influencers.map((item, index) => {
      const accounts = item.accounts?.length ? item.accounts : [{ platform: item.platform === "TikTok" ? "TikTok" as const : "Instagram" as const, username: null, followers: Number.parseInt(item.followers.replace(/\D/g, ""), 10) || 0 }];
      const niches = item.niches?.length ? item.niches.filter((niche) => niche !== "Lainnya") : item.niche.split(",").map((niche) => niche.trim()).filter((niche) => niche && niche !== "Belum diisi");
      const packageCards = item.rateCards || [];
      const lowest = item.collaborationType === "Barter Endorse" ? null : packageCards.length ? Math.min(...packageCards.map((card) => card.amount)) : item.rate;
      return <tr key={item.id ?? item.name}>
        <td><div className="table-person"><Avatar name={item.name} tone={index % 2 ? "orange" : "purple"} /><div><strong>{item.name}</strong><small>{item.status}</small></div></div></td>
        <td><span className={`influencer-kind-badge ${item.collaborationType === "Barter Endorse" ? "barter" : "paid"}`}>{item.collaborationType || "Influencer"}</span></td>
        <td><div className="influencer-niche-tags">{niches.length ? niches.map((niche) => <span key={niche}>{niche}</span>) : <small>Belum diisi</small>}{item.customNiche && <span>{item.customNiche}</span>}</div></td>
        <td><div className="influencer-account-links">{accounts.map((account, accountIndex) => { const href = account.username ? influencerAccountUrl(account.platform, account.username) : null; return <div className="influencer-account-link" key={`${account.platform}-${account.id ?? accountIndex}`}><span className={`influencer-platform-mark ${account.platform === "TikTok" ? "tiktok" : "instagram"}`}>{account.platform === "TikTok" ? "TT" : "IG"}</span>{href ? <a href={href} target="_blank" rel="noreferrer">@{account.username}</a> : <span className="muted-cell">{account.platform} · username belum diisi</span>}<small>{compactFollowerCount(account.followers)} followers</small></div>; })}</div></td>
        <td><div className="influencer-rate-card-summary"><strong>{packageCards.length || 1} paket</strong><small>{item.collaborationType === "Barter Endorse" ? "Nilai barter tersimpan sebagai estimasi" : `Mulai ${rupiah(lowest ?? item.rate)}`}</small>{packageCards.slice(0, 2).map((card) => <span key={card.id || card.name}>{card.name} · {rupiah(card.amount)}</span>)}{packageCards.length > 2 && <span>+{packageCards.length - 2} paket lainnya</span>}</div></td>
        {canEditProfiles && <td><button className="button button-soft button-sm" onClick={() => { setEditingInfluencer(item); setProfileDialogOpen(true); }}><Icon name="edit" size={13} />Edit</button></td>}
      </tr>;
    })}</tbody></table></div>{data.influencers.length === 0 && <div className="influencer-master-empty"><strong>Belum ada data influencer</strong><span>Tambahkan profil untuk memilih akun dan paket saat menyusun jadwal campaign.</span></div>}</div>
    {unlinked.length > 0 && (
      <section className="card table-card" style={{ marginTop: 18 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title">Jadwal tanpa campaign</h2>
            <p className="card-subtitle">Histori tetap tersimpan. Pilih campaign untuk menautkan record yang sudah ada.</p>
          </div>
          <span className="status-pill">{unlinked.length} belum tertaut</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Influencer</th><th>Deliverable</th><th>Jadwal lama</th><th>Biaya</th><th>Status / pembayaran</th><th>Tautkan</th></tr></thead>
            <tbody>
              {unlinked.map((item) => (
                <tr key={String(item.id)}>
                  <td>{item.influencer}<small>{item.platform}</small></td>
                  <td>{item.content}</td>
                  <td>{formatDisplayDate(item.visitDate)} · {formatDisplayDate(item.uploadDate || item.date)}</td>
                  <td>
                    {item.collaborationType === "Barter Endorse" ? (
                      <><span>Barter</span><small>Estimasi {rupiah(item.barterValue ?? 0)}</small></>
                    ) : (
                      <><span>{rupiah(item.rate)}</span><small>Spent {rupiah(item.spent)}</small></>
                    )}
                  </td>
                  <td>
                    <StatusPill status={displayInfluencerBookingStatus(item.status)} className={`campaign-influencer-status-pill cooperation-${influencerBookingStatusTone(item.status)}`} />
                    {item.collaborationType === "Barter Endorse" ? (
                      <span className="influencer-payment-not-applicable">Tidak berlaku</span>
                    ) : (
                      <StatusPill status={displayInfluencerPaymentStatus(item.paymentStatus)} className={`campaign-influencer-status-pill payment-${influencerPaymentStatusTone(item.paymentStatus)}`} />
                    )}
                  </td>
                  <td>
                    <select className="input" aria-label={`Tautkan jadwal ${item.influencer} ke campaign`} disabled={readOnly || Boolean(linkingId) || !activeCampaigns.length} value="" onChange={(event) => void linkToCampaign(String(item.id), event.target.value)}>
                      <option value="" disabled>{activeCampaigns.length ? "Pilih campaign" : "Tidak ada campaign"}</option>
                      {activeCampaigns.map((campaign) => <option value={String(campaign.id)} key={campaign.id}>{campaign.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    )}
    {profileDialogOpen && <InfluencerProfileDialog initial={editingInfluencer || undefined} onClose={() => { setProfileDialogOpen(false); setEditingInfluencer(null); }} onSave={async (input, id) => { await saveInfluencerProfile(input, id); notify(editingInfluencer ? "Profil influencer diperbarui." : "Profil influencer ditambahkan."); }} />}
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

export function AnalyticsView({ data, openModal, openTaskEditor, setData, notify, getAccessToken, refreshData, liveMode }: CommonProps) {
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
    <div className="social-account-grid">{data.socialAccounts.map((account) => <article className="card social-account-card" key={account.id}><div className={`platform-logo large ${account.platform}`}>{platformMeta[account.platform].short}</div><div className="social-account-copy"><strong>{account.name}</strong><span>{account.handle}</span><small>Sinkron: {formatDisplayDateTime(account.lastSync, { empty: "Belum pernah" })}</small></div><div className="social-account-status"><StatusPill status={account.status === "connected" ? "Terhubung" : "Perlu perhatian"} /><strong>{compact(account.followers)}</strong><span>followers</span></div></article>)}</div>
    <div className="analytics-metrics"><AnalyticsMetric label="Followers" value={compact(totals.followers)} change={liveMode ? "Dari provider" : "+4,8%"} icon="users" live={liveMode} /><AnalyticsMetric label="Reach" value={compact(totals.reach)} change={liveMode ? "Snapshot terbaru" : "+12,4%"} icon="target" live={liveMode} /><AnalyticsMetric label="Impressions" value={compact(totals.impressions)} change={liveMode ? "Snapshot terbaru" : "+9,7%"} icon="eye" live={liveMode} /><AnalyticsMetric label="Engagement" value={`${totals.engagement.toFixed(1)}%`} change={liveMode ? "Dihitung dari data" : "+0,6%"} icon="chart" live={liveMode} /><AnalyticsMetric label="Video views" value={compact(totals.views)} change={liveMode ? "Dari provider" : "+18,2%"} icon="campaign" live={liveMode} /></div>
    <div className="analytics-grid"><div className="card analytics-chart-card"><div className="card-header"><div><h2 className="card-title">Perkembangan reach</h2><p className="card-subtitle">Perbandingan performa antar-platform</p></div><span className={`goal-label ${liveMode ? "goal-ok" : "goal-low"}`}>{liveMode ? "Live provider" : "Demo data"}</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs>{Object.entries(platformMeta).map(([key, meta]) => <linearGradient id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1" key={key}><stop offset="5%" stopColor={meta.color} stopOpacity={0.18} /><stop offset="95%" stopColor={meta.color} stopOpacity={0} /></linearGradient>)}</defs><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="date" tickFormatter={(value) => formatDisplayDate(String(value), { referenceYear: liveMode ? undefined : 2026 })} minTickGap={35} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 10 }} /><YAxis axisLine={false} tickLine={false} tickFormatter={(value) => compact(value)} tick={{ fill: "var(--muted)", fontSize: 10 }} /><Tooltip labelFormatter={(label) => formatDisplayDate(String(label), { referenceYear: liveMode ? undefined : 2026 })} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 11 }} />{Object.entries(platformMeta).map(([key, meta]) => <Area type="monotone" dataKey={key} stroke={meta.color} fill={`url(#fill-${key})`} strokeWidth={2} key={key} />)}</AreaChart></ResponsiveContainer></div></div>
      <div className="card"><div className="card-header"><div><h2 className="card-title">Rekomendasi tindakan</h2><p className="card-subtitle">Insight otomatis dari data terbaru</p></div><span className="goal-label goal-low">2 alert</span></div><div className="recommendation-list"><Recommendation title="TikTok perlu sinkron ulang" text="Perbarui token akses agar data video terbaru tetap masuk otomatis." onClick={() => notify("Pengaturan koneksi TikTok dibuka dalam mode konfigurasi.")} /><Recommendation title="Facebook tertinggal" text="Reach Facebook lebih rendah. Adaptasi tiga konten Instagram terbaik untuk format Facebook." onClick={() => openTaskEditor()} /></div></div></div>
    <div className="card social-content-table"><div className="card-header"><div><h2 className="card-title">Konten terbaik</h2><p className="card-subtitle">Diurutkan berdasarkan reach Oktober 2026</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Konten</th><th>Platform</th><th>Tanggal</th><th>Reach</th><th>Engagement</th><th>Status</th></tr></thead><tbody>{data.socialPosts.filter((post) => platform === "all" || post.platform === platform).map((post) => <tr key={post.id}><td><strong>{post.title}</strong></td><td><span className={`platform-badge ${post.platform}`}>{platformMeta[post.platform].label}</span></td><td>{formatDisplayDate(post.publishedAt)}</td><td>{compact(post.reach)}</td><td className="trend-up">{post.engagementRate}%</td><td><StatusPill status="Tayang" /></td></tr>)}</tbody></table></div></div>
  </>;
}
function AnalyticsMetric({ label, value, change, icon, live }: { label: string; value: string; change: string; icon: string; live?: boolean }) { return <div className="card analytics-metric"><div className="analytics-metric-top"><span>{label}</span><Icon name={icon} size={16} /></div><strong>{value}</strong><p className={live ? "muted-cell" : "trend-up"}>{live ? change : `↗ ${change} vs periode lalu`}</p><div className="target">{live ? "Data sinkron provider" : "Semua akun terpilih"}</div></div>; }
function Recommendation({ title, text, onClick }: { title: string; text: string; onClick: () => void }) { return <div className="recommendation"><div className="recommendation-top"><strong>{title}</strong><PriorityPill priority="Tinggi" /></div><p>{text}</p><button className="button button-soft button-sm" onClick={onClick}>Jadikan tugas ↗</button></div>; }

export function AccountView({ data, identity = { name: "Super Admin", username: "", email: "", whatsapp: "", role: "Super Admin", accessRole: "owner" }, openModal, navigate, notify, uploadOwnAvatar }: CommonProps) {
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const avatarInput = useRef<HTMLInputElement>(null);
  const uploadAvatar = async (file?: File) => {
    if (!file || uploadingAvatar) return;
    const validation = validateUserAvatar(file);
    if (validation) { setAvatarError(validation); return; }
    const signature = userAvatarExtension(new Uint8Array(await file.slice(0, 12).arrayBuffer()), file.type);
    if (!signature) { setAvatarError("Isi file tidak sesuai format foto."); return; }
    if (!uploadOwnAvatar) { setAvatarError("Fitur ubah foto belum tersedia."); return; }
    setUploadingAvatar(true);
    setAvatarError("");
    try {
      await uploadOwnAvatar(file);
      notify("Foto profil berhasil diperbarui.");
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : "Foto gagal diunggah.");
    } finally {
      setUploadingAvatar(false);
    }
  };
  const accessLabel = canManageUsers(identity) ? "Super Admin" : identity.accessRole === "viewer" ? "Viewer" : "Anggota tim";
  return <><PageHeading kicker="Akun / Keamanan" title="Akun & keamanan" description="Informasi akun dan keamanan akses Anda." action={<button className="button button-danger" onClick={() => notify("logout")}><Icon name="log-out" size={15} />Keluar</button>} />
    <div className="account-grid"><div className="card profile-card"><div className="profile-avatar"><Avatar name={identity.name} src={identity.avatarUrl} /></div><button type="button" className="button button-soft button-sm profile-avatar-change" onClick={() => avatarInput.current?.click()} disabled={uploadingAvatar || !uploadOwnAvatar}><Icon name="image" size={13} />{uploadingAvatar ? "Mengunggah…" : "Ganti foto profil"}</button><input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Pilih foto profil baru" hidden disabled={uploadingAvatar} onChange={(event) => { void uploadAvatar(event.target.files?.[0]); event.target.value = ""; }} />{avatarError && <p className="campaign-form-error profile-avatar-error" role="alert">{avatarError}</p>}<h2>{identity.name}</h2><div className="role">{identity.role}{identity.role !== accessLabel ? ` · ${accessLabel}` : ""}</div><div className="profile-mail">@{identity.username}</div><p className="profile-managed-note">Anda dapat mengganti foto sendiri. Data akun lainnya dikelola oleh Super Admin.</p><div className="profile-stat"><div><strong>{data.campaigns.filter((campaign) => (campaign.lifecycleStatus || "active") === "active").length}</strong><span>Campaign aktif</span></div><div><strong>{data.tasks.filter((task) => task.status === "Done").length}</strong><span>Task selesai</span></div></div><div className="profile-actions"><button className="button button-ghost button-sm" onClick={() => openModal("password")}>Ganti PIN</button></div></div>
      <div className="card"><div className="card-header"><div><h2 className="card-title">Akses akun Anda</h2><p className="card-subtitle">{accessLevels.find((level) => level.value === identity.accessRole)?.label || accessLabel}</p></div></div><p className="card-subtitle">{accessLevels.find((level) => level.value === identity.accessRole)?.description}</p>{canManageUsers(identity) && <button className="button button-primary" style={{ marginTop: 18 }} onClick={() => navigate("users")}><Icon name="users" size={14} />Buka Manajemen User</button>}</div></div>
  </>;
}
