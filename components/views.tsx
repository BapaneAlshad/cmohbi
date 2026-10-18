"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AppData, EntityId, SocialPlatform, TaskStatus, UserIdentity } from "@/lib/types";
import { Avatar, compact, Icon, PageHeading, PriorityPill, rupiah, StatusPill } from "./ui";

type CommonProps = {
  data: AppData;
  identity?: UserIdentity;
  openModal: (type: string) => void;
  openResetPin?: (user: AppData["users"][number]) => void;
  navigate: (view: string) => void;
  notify: (message: string) => void;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  getAccessToken?: () => Promise<string | null>;
  refreshData?: () => Promise<void>;
  liveMode?: boolean;
};

function PrimaryAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button className="button button-primary" onClick={onClick}><Icon name="plus" size={15} />{children}</button>;
}

function CampaignRow({ campaign }: { campaign: AppData["campaigns"][number] }) {
  return <div className="campaign-row"><div className="campaign-brand">{campaign.brand === "HBI" ? "H" : "HB"}</div><div className="campaign-copy"><strong>{campaign.name}</strong><span>{campaign.brand} · {campaign.status}</span></div><div className="campaign-progress-wrap"><div className="progress-track"><span style={{ width: `${campaign.progress}%` }} /></div><div className="progress-meta"><span>{campaign.progress}% selesai</span><span>{campaign.kpi}</span></div></div><div className="campaign-budget"><strong>{rupiah(campaign.budget - campaign.spent)}</strong><span>sisa budget</span></div></div>;
}

export function DashboardView({ data, navigate }: CommonProps) {
  const [today, setToday] = useState("Hari ini");
  const active = data.campaigns.filter((item) => item.status === "Berjalan").length;
  const pending = data.tasks.filter((item) => item.status !== "Done").length;
  const latest = latestByPlatform(data);
  const followers = Object.values(latest).reduce((sum, item) => sum + (item?.followers ?? 0), 0);
  const reach = Object.values(latest).reduce((sum, item) => sum + (item?.reach ?? 0), 0);
  const engagement = average(Object.values(latest).map((item) => item?.engagementRate ?? 0));
  useEffect(() => {
    const updateToday = () => setToday(new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(new Date()));
    updateToday();
    const interval = window.setInterval(updateToday, 60_000);
    return () => window.clearInterval(interval);
  }, []);
  return <>
    <div className="dashboard-toolbar"><span className="date-chip"><Icon name="calendar" size={14} />{today}</span></div>
    <section className="hero-panel"><div className="hero-copy"><div className="eyebrow">Ringkasan hari ini</div><h2>Tim kamu punya {pending} tugas yang perlu perhatian.</h2><p>Campaign, konten, dan performa sosial media tersaji dalam satu workspace.</p></div><div className="hero-illustration"><div className="hero-orb" /><div className="hero-person" /><div className="hero-board"><i /><i /><i /></div></div></section>
    <section className="stats-grid">
      <StatCard label="Campaign aktif" value={`${active} / ${data.campaigns.length}`} note="12% dari bulan lalu" progress={68} icon="campaign" />
      <StatCard label="Tugas tertunda" value={`${pending} tugas`} note="4 perlu perhatian" progress={42} icon="check-square" tone="orange" />
      <StatCard label="Akun sosial" value={`${data.socialAccounts.length} platform`} note="2 tersinkron hari ini" progress={72} icon="users" tone="blue" />
      <StatCard label="Butuh approval" value="3 item" note="2 item baru hari ini" progress={56} icon="alert" tone="coral" />
    </section>
    <section className="dashboard-grid">
      <div className="card social-card"><div className="card-header"><div><h2 className="card-title">KPI Sosial Media</h2><p className="card-subtitle">Instagram, Facebook, Threads, dan TikTok</p></div><button className="link-button" onClick={() => navigate("analytics")}>Lihat analitik ↗</button></div>
        <MetricRow label="Followers" value={compact(followers)} target="320K" positive change="+4,8%" />
        <MetricRow label="Reach" value={compact(reach)} target="750K" positive change="+12,4%" />
        <MetricRow label="Engagement" value={`${engagement.toFixed(1)}%`} target="5%" positive={engagement >= 5} change={engagement >= 5 ? "+0,6%" : "-0,4%"} />
      </div>
      <div className="card alert-card"><div className="card-header"><div><h2 className="card-title">Peringatan & Persetujuan</h2><p className="card-subtitle">Item yang perlu ditindaklanjuti</p></div><button className="link-button" onClick={() => navigate("requests")}>Lihat semua</button></div><div className="alert-list">
        <AlertItem icon="wallet" title="Pengeluaran menunggu approval" sub={`Studio Kuning · ${rupiah(3000000)}`} time="10 mnt" />
        <AlertItem icon="alert" title="TikTok perlu sinkron ulang" sub="Token akses akan segera kedaluwarsa" time="45 mnt" tone="coral" />
        <AlertItem icon="check" title="Konten menunggu review" sub="Carousel: Rayakan Merdeka" time="2 jam" tone="blue" />
      </div></div>
    </section>
    <section className="dashboard-bottom"><div className="card"><div className="card-header"><div><h2 className="card-title">Progres Campaign</h2><p className="card-subtitle">Campaign yang sedang berjalan</p></div><button className="link-button" onClick={() => navigate("campaigns")}>Kelola campaign ↗</button></div>{data.campaigns.slice(0, 3).map((campaign) => <CampaignRow campaign={campaign} key={campaign.id} />)}</div>
      <div className="card"><div className="card-header"><div><h2 className="card-title">Agenda terdekat</h2><p className="card-subtitle">Jangan lewatkan momen penting</p></div><button className="link-button" onClick={() => navigate("calendar")}>Kalender ↗</button></div><div className="schedule-list"><Schedule day="12" title="Review konten Instagram" meta="Dengan CMO · 10:00 WIB" /><Schedule day="14" title="Posting Weekend Treats" meta="TikTok · 16:00 WIB" /><Schedule day="17" title="Brief influencer BSD" meta="Ruang Meeting 2 · 13:00 WIB" /></div></div>
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

export function CampaignsView({ data, openModal }: CommonProps) {
  return <><PageHeading kicker="Workspace / Campaign" title="Kelola campaign" description="Pantau strategi, budget, dan progres semua campaign HBI." action={<PrimaryAction onClick={() => openModal("campaign")}>Buat campaign</PrimaryAction>} />
    <div className="toolbar"><div className="toolbar-left"><span className="result-count">{data.campaigns.length} campaign ditemukan</span><button className="filter-chip">Semua status</button><button className="filter-chip">Semua brand</button></div></div>
    <div className="campaign-grid">{data.campaigns.map((campaign) => <article className="card campaign-card" key={campaign.id}><div className="campaign-card-top"><div className="campaign-card-brand"><div className="campaign-brand">{campaign.brand === "HBI" ? "H" : "HB"}</div><div><h3>{campaign.name}</h3><div className="meta">{campaign.brand} · {campaign.period}</div></div></div><StatusPill status={campaign.status} /></div><div className="campaign-card-body"><div className="progress-track"><span style={{ width: `${campaign.progress}%` }} /></div><div className="progress-meta"><span>{campaign.progress}% selesai</span><span>{campaign.pic}</span></div><div className="campaign-kpis"><MiniKpi label="Budget" value={rupiah(campaign.budget)} /><MiniKpi label="Terpakai" value={rupiah(campaign.spent)} /><MiniKpi label="Task" value={`${campaign.tasks}`} /><MiniKpi label="Konten" value={`${campaign.content}`} /></div></div><div className="campaign-card-footer"><span className="due-label">Target: {campaign.kpi}</span><div className="people"><Avatar name={campaign.pic} /></div></div></article>)}</div>
  </>;
}
function MiniKpi({ label, value }: { label: string; value: string }) { return <div className="mini-kpi"><strong>{value}</strong><span>{label}</span></div>; }

export function TodoView({ data, openModal, setData, notify }: CommonProps) {
  const [filters, setFilters] = useState({ brand: "Semua", pic: "Semua", priority: "Semua" });
  const statuses: TaskStatus[] = ["Backlog", "To Do", "In Progress", "Review", "Revisi", "Done"];
  const filtered = data.tasks.filter((task) => (filters.brand === "Semua" || task.brand === filters.brand) && (filters.pic === "Semua" || task.pic === filters.pic) && (filters.priority === "Semua" || task.priority === filters.priority));
  const updateStatus = (id: EntityId, status: TaskStatus) => { setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, status } : task) })); notify(`Status tugas dipindahkan ke ${status}.`); };
  return <><PageHeading kicker="Workspace / To-Do" title="Papan kerja tim" description="Semua tugas tersusun rapi, setiap progres terlihat jelas." action={<PrimaryAction onClick={() => openModal("task")}>Tambah tugas</PrimaryAction>} />
    <div className="toolbar"><div className="toolbar-left"><span className="result-count">Filter tugas:</span><FilterSelect value={filters.brand} values={["Semua", "HBI", "HokBen"]} onChange={(brand) => setFilters({ ...filters, brand })} /><FilterSelect value={filters.pic} values={["Semua", ...data.users.map((user) => user.name)]} onChange={(pic) => setFilters({ ...filters, pic })} /><FilterSelect value={filters.priority} values={["Semua", "Tinggi", "Sedang", "Rendah"]} onChange={(priority) => setFilters({ ...filters, priority })} /></div><button className="button button-soft button-sm" onClick={() => setFilters({ brand: "Semua", pic: "Semua", priority: "Semua" })}>Reset filter</button></div>
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
  const total = data.transactions.reduce((sum, item) => sum + item.amount, 0);
  return <><PageHeading kicker="Operasional / Mitra & Keuangan" title="Mitra & keuangan" description="Kelola relasi KOL dan pengeluaran marketing di satu tempat." action={<PrimaryAction onClick={() => openModal(tab === "influencers" ? "influencer" : "transaction")}>{tab === "influencers" ? "Tambah influencer" : "Catat transaksi"}</PrimaryAction>} />
    <div className="view-tabs partner-tabs"><button className={`view-tab ${tab === "influencers" ? "active" : ""}`} onClick={() => setTab("influencers")}>Daftar influencer</button><button className={`view-tab ${tab === "finance" ? "active" : ""}`} onClick={() => setTab("finance")}>Keuangan & rekap</button></div>
    {tab === "influencers" ? <div className="card table-card"><div className="card-header"><div><h2 className="card-title">Daftar influencer / KOL</h2><p className="card-subtitle">Fokus Instagram, Facebook, dan TikTok</p></div><button className="link-button"><Icon name="download" size={14} />Export data</button></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Influencer</th><th>Platform</th><th>Niche</th><th>Followers</th><th>Engagement</th><th>Rate card</th><th>Status</th></tr></thead><tbody>{data.influencers.map((item, index) => <tr key={item.name}><td><div className="table-person"><Avatar name={item.name} tone={index % 2 ? "orange" : "purple"} /><span>{item.name}</span></div></td><td>{item.platform}</td><td>{item.niche}</td><td>{item.followers}</td><td className="trend-up">{item.engagement}</td><td>{rupiah(item.rate)}</td><td><StatusPill status={item.status} /></td></tr>)}</tbody></table></div></div> : <><section className="partner-summary"><div className="card summary-mini"><span>Total pengeluaran Oktober</span><strong>{rupiah(total)}</strong><p>↗ 8,4% dari bulan lalu</p></div><div className="card summary-mini"><span>Sudah dibayar</span><strong>{rupiah(data.transactions.filter((item) => item.status === "Sudah Dibayar").reduce((sum, item) => sum + item.amount, 0))}</strong><p>Realisasi berjalan</p></div><div className="card summary-mini"><span>Belum dibayar</span><strong>{rupiah(data.transactions.filter((item) => item.status !== "Sudah Dibayar").reduce((sum, item) => sum + item.amount, 0))}</strong><p className="trend-down">Perlu diproses</p></div></section><div className="card table-card"><div className="card-header"><div><h2 className="card-title">Transaksi terbaru</h2><p className="card-subtitle">Rencana dan realisasi biaya</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Vendor</th><th>Kategori</th><th>Tanggal</th><th>Jumlah</th><th>Tipe</th><th>Status</th></tr></thead><tbody>{data.transactions.map((item) => <tr key={`${item.vendor}-${item.date}`}><td>{item.vendor}<small>{item.brand}</small></td><td>{item.category}</td><td>{displayDate(item.date)}</td><td>{rupiah(item.amount)}</td><td>{item.type}</td><td><StatusPill status={item.status} /></td></tr>)}</tbody></table></div></div></>}
  </>;
}

function influencerDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

export function InfluencerScheduleView({ data, openModal }: CommonProps) {
  const schedules = [...data.influencerSchedules].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
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
    <div className="analytics-grid"><div className="card analytics-chart-card"><div className="card-header"><div><h2 className="card-title">Perkembangan reach</h2><p className="card-subtitle">Perbandingan performa antar-platform</p></div><span className={`goal-label ${liveMode ? "goal-ok" : "goal-low"}`}>{liveMode ? "Live provider" : "Demo data"}</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs>{Object.entries(platformMeta).map(([key, meta]) => <linearGradient id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1" key={key}><stop offset="5%" stopColor={meta.color} stopOpacity={0.18} /><stop offset="95%" stopColor={meta.color} stopOpacity={0} /></linearGradient>)}</defs><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 9 }} /><YAxis axisLine={false} tickLine={false} tickFormatter={(value) => compact(value)} tick={{ fill: "var(--muted)", fontSize: 9 }} /><Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 10 }} />{Object.entries(platformMeta).map(([key, meta]) => <Area type="monotone" dataKey={key} stroke={meta.color} fill={`url(#fill-${key})`} strokeWidth={2} key={key} />)}</AreaChart></ResponsiveContainer></div></div>
      <div className="card"><div className="card-header"><div><h2 className="card-title">Rekomendasi tindakan</h2><p className="card-subtitle">Insight otomatis dari data terbaru</p></div><span className="goal-label goal-low">2 alert</span></div><div className="recommendation-list"><Recommendation title="TikTok perlu sinkron ulang" text="Perbarui token akses agar data video terbaru tetap masuk otomatis." onClick={() => notify("Pengaturan koneksi TikTok dibuka dalam mode konfigurasi.")} /><Recommendation title="Facebook tertinggal" text="Reach Facebook lebih rendah. Adaptasi tiga konten Instagram terbaik untuk format Facebook." onClick={() => { setData((current) => ({ ...current, tasks: [...current.tasks, { id: globalThis.crypto.randomUUID(), title: "Adaptasi konten terbaik untuk Facebook", brand: "HBI", pic: "Sinta Dewi", due: "14 Okt", priority: "Sedang", status: "To Do", campaign: null }] })); notify("Rekomendasi berhasil dijadikan tugas."); }} /></div></div></div>
    <div className="card social-content-table"><div className="card-header"><div><h2 className="card-title">Konten terbaik</h2><p className="card-subtitle">Diurutkan berdasarkan reach Oktober 2026</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Konten</th><th>Platform</th><th>Tanggal</th><th>Reach</th><th>Engagement</th><th>Status</th></tr></thead><tbody>{data.socialPosts.filter((post) => platform === "all" || post.platform === platform).map((post) => <tr key={post.id}><td><strong>{post.title}</strong></td><td><span className={`platform-badge ${post.platform}`}>{platformMeta[post.platform].label}</span></td><td>{post.publishedAt}</td><td>{compact(post.reach)}</td><td className="trend-up">{post.engagementRate}%</td><td><StatusPill status="Tayang" /></td></tr>)}</tbody></table></div></div>
  </>;
}
function AnalyticsMetric({ label, value, change, icon, live }: { label: string; value: string; change: string; icon: string; live?: boolean }) { return <div className="card analytics-metric"><div className="analytics-metric-top"><span>{label}</span><Icon name={icon} size={16} /></div><strong>{value}</strong><p className={live ? "muted-cell" : "trend-up"}>{live ? change : `↗ ${change} vs periode lalu`}</p><div className="target">{live ? "Data sinkron provider" : "Semua akun terpilih"}</div></div>; }
function Recommendation({ title, text, onClick }: { title: string; text: string; onClick: () => void }) { return <div className="recommendation"><div className="recommendation-top"><strong>{title}</strong><PriorityPill priority="Tinggi" /></div><p>{text}</p><button className="button button-soft button-sm" onClick={onClick}>Jadikan tugas ↗</button></div>; }

export function AccountView({ data, identity = { name: "Andi Saputra", username: "andi.saputra", email: "andi@hbi.co.id", whatsapp: "+6281212345678", role: "CMO" }, openModal, openResetPin, notify }: CommonProps) {
  const initials = identity.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <><PageHeading kicker="Akun / Keamanan" title="Akun & keamanan" description="Kelola profil, tim, dan akses fitur Ngapaya." action={<button className="button button-danger" onClick={() => notify("logout")}><Icon name="log-out" size={15} />Keluar</button>} />
    <div className="account-grid"><div className="card profile-card"><div className="profile-avatar">{initials}</div><h2>{identity.name}</h2><div className="role">{identity.role} · Full access</div><div className="profile-mail">@{identity.username}<br />{identity.email}<br />{identity.whatsapp || "Nomor WhatsApp belum diisi"}</div><button className="button button-soft button-sm" onClick={() => openModal("profile")}>Edit profil</button><div className="profile-stat"><div><strong>{data.campaigns.length}</strong><span>Campaign</span></div><div><strong>{data.tasks.filter((task) => task.status === "Done").length}</strong><span>Task selesai</span></div></div><div className="profile-actions"><button className="button button-ghost button-sm" onClick={() => openModal("password")}>Ganti PIN</button></div></div>
      <div className="card"><div className="card-header"><div><h2 className="card-title">Kelola pengguna</h2><p className="card-subtitle">Atur peran, akses, dan reset PIN anggota tim.</p></div><button className="button button-primary button-sm" onClick={() => openModal("user")}><Icon name="plus" size={14} />Tambah user</button></div>{data.users.map((user, index) => <div className="permission-row" key={user.username || user.email}><div className="table-person"><Avatar name={user.name} tone={index === 1 ? "green" : "purple"} /><div className="permission-copy"><strong>{user.name}</strong><span>@{user.username} · {user.email} · {user.role}</span></div></div><div className="table-person"><StatusPill status={user.status} />{openResetPin && user.username && <button className="link-button reset-pin-button" onClick={() => openResetPin(user)}>Reset PIN</button>}</div></div>)}</div></div>
  </>;
}
