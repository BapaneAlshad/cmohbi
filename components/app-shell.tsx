"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { AppData, ContentItem, Influencer, Task, Transaction, User, ViewName } from "@/lib/types";
import { demoData } from "@/lib/demo-data";
import { loadLocalData, resetLocalData, saveLocalData } from "@/lib/storage";
import { AccountView, AnalyticsView, CalendarView, CampaignsView, DashboardView, PartnersView, RequestsView, TodoView } from "./views";
import { Avatar, Icon } from "./ui";

const navigation: Array<{ group?: string; view: ViewName; label: string; icon: string; count?: string }> = [
  { group: "WORKSPACE", view: "dashboard", label: "Dashboard", icon: "home" },
  { view: "campaigns", label: "Campaign", icon: "campaign", count: "4" },
  { view: "todo", label: "To-Do", icon: "check-square", count: "12" },
  { group: "OPERASIONAL", view: "calendar", label: "Kalender Konten", icon: "calendar" },
  { view: "requests", label: "Request & Ide", icon: "sparkles", count: "3" },
  { view: "partners", label: "Mitra & Keuangan", icon: "handshake" },
  { view: "analytics", label: "Analitik Sosmed", icon: "chart" },
  { group: "AKUN", view: "account", label: "Akun & Keamanan", icon: "users" },
];

const titles: Record<ViewName, string> = { dashboard: "Dashboard", campaigns: "Campaign", todo: "To-Do", calendar: "Kalender Konten", requests: "Request & Ide", partners: "Mitra & Keuangan", analytics: "Analitik Sosmed", account: "Akun & Keamanan" };

export function AppShell() {
  const [view, setView] = useState<ViewName>("dashboard");
  const [data, setData] = useState<AppData>(() => structuredClone(demoData));
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modal, setModal] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [loggedIn, setLoggedIn] = useState(true);
  const hydrated = useRef(false);

  useEffect(() => {
    setData(loadLocalData());
    setTheme(window.localStorage.getItem("ngapaya-theme") === "dark" ? "dark" : "light");
    setCollapsed(window.localStorage.getItem("ngapaya-sidebar-collapsed") === "true");
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (hydrated.current) saveLocalData(data);
  }, [data]);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", theme === "dark");
    window.localStorage.setItem("ngapaya-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    window.localStorage.setItem("ngapaya-sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  const notify = (message: string) => {
    if (message === "logout") { setLoggedIn(false); return; }
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };
  const navigate = (target: string) => { setView(target as ViewName); setSidebarOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const common = { data, openModal: setModal, navigate, notify, setData };

  if (!loggedIn) return <LoginScreen onLogin={() => { setLoggedIn(true); notify("Selamat datang kembali, Andi."); }} />;

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} id="sidebar">
      <div className="brand-wrap"><div className="brand-mark">N</div><div className="brand-copy"><div className="brand-name">ngapaya</div><div className="brand-subtitle">Marketing OS</div></div><button className="icon-button sidebar-collapse" onClick={() => setCollapsed(!collapsed)} aria-label="Ciutkan sidebar"><Icon name="panel" /></button><button className="icon-button close-sidebar" onClick={() => setSidebarOpen(false)} aria-label="Tutup menu"><Icon name="close" /></button></div>
      <div className="workspace-switcher soft-inset"><div className="workspace-avatar">H</div><div className="workspace-copy"><strong>HBI Marketing</strong><span>Workspace utama</span></div><span className="chevron">⌄</span></div>
      <nav className="main-nav" aria-label="Navigasi utama">{navigation.map((item) => <div key={item.view}>{item.group && <div className={`nav-label ${item.group !== "WORKSPACE" ? "nav-gap" : ""}`}>{item.group}</div>}<button className={`nav-item ${view === item.view ? "active" : ""}`} onClick={() => navigate(item.view)}><Icon className="nav-icon" name={item.icon} size={17} /><span>{item.label}</span>{item.count && <span className="nav-count">{item.count}</span>}</button></div>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-orb">?</div><div><strong>Butuh bantuan?</strong><span>Mode data: {process.env.NEXT_PUBLIC_SUPABASE_URL ? "Supabase" : "Demo lokal"}</span></div><span className="arrow">↗</span></div><div className="user-mini"><Avatar name="Andi Saputra" /><div className="user-mini-copy"><strong>Andi Saputra</strong><span>CMO · HBI</span></div><button className="icon-button" onClick={() => navigate("account")}><Icon name="more-horizontal" /></button></div></div>
    </aside>
    <button className={`sidebar-backdrop ${sidebarOpen ? "visible" : ""}`} onClick={() => setSidebarOpen(false)} aria-label="Tutup menu" />
    <main className="main-area"><header className="topbar"><div className="topbar-left"><button className="icon-button menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Buka menu"><Icon name="menu" /></button><div className="crumbs"><span>Workspace</span><b>/</b><strong>{titles[view]}</strong></div></div><div className="topbar-actions"><label className="search-box"><Icon name="search" /><input type="search" placeholder="Cari apa saja..." aria-label="Cari di workspace" onKeyDown={(event) => { if (event.key === "Enter") notify(`Pencarian “${event.currentTarget.value}” siap digunakan.`); }} /></label><button className="icon-button theme-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Ubah tema"><Icon name={theme === "dark" ? "sun" : "moon"} /></button><button className="icon-button notification-button" onClick={() => notify("Tidak ada notifikasi baru.")} aria-label="Notifikasi"><Icon name="bell" /><i /></button><button className="top-profile" onClick={() => navigate("account")}><Avatar name="Andi Saputra" /><span className="top-profile-copy"><strong>Andi Saputra</strong><small>CMO</small></span><span className="chevron">⌄</span></button></div></header>
      <div className="page-content">{view === "dashboard" && <DashboardView {...common} />}{view === "campaigns" && <CampaignsView {...common} />}{view === "todo" && <TodoView {...common} />}{view === "calendar" && <CalendarView {...common} />}{view === "requests" && <RequestsView {...common} />}{view === "partners" && <PartnersView {...common} />}{view === "analytics" && <AnalyticsView {...common} />}{view === "account" && <AccountView {...common} />}</div>
    </main>
    <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    {modal && <AppModal type={modal} data={data} close={() => setModal(null)} notify={notify} setData={setData} />}
  </div>;
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return <div className="login-screen" style={{ display: "grid" }}><div className="card login-card"><div className="brand-mark">N</div><h1>Selamat datang di Ngapaya</h1><p>Satu ruang kerja untuk seluruh kegiatan marketing HBI.<br />Masuk untuk melanjutkan pekerjaanmu.</p><form className="form-stack" onSubmit={(event) => { event.preventDefault(); onLogin(); }}><div className="form-field"><label>Email</label><input className="input" type="email" required defaultValue="andi@hbi.co.id" /></div><div className="form-field"><label>Kata sandi</label><input className="input" type="password" required defaultValue="ngapaya123" /></div><button className="button button-primary" type="submit">Masuk ke workspace ↗</button></form><div className="demo-hint">Mode demo · gunakan email dan kata sandi apa saja</div></div></div>;
}

const modalInfo: Record<string, { title: string; description: string }> = {
  task: { title: "Tambah tugas baru", description: "Buat tugas dan pastikan PIC serta deadline-nya jelas." },
  campaign: { title: "Buat campaign baru", description: "Isi target terukur agar progres campaign mudah dipantau." },
  content: { title: "Jadwalkan konten", description: "Konten baru akan masuk kalender dengan status Draf." },
  request: { title: "Buat request / ide", description: "Catat masukan agar bisa ditindaklanjuti dengan jelas." },
  influencer: { title: "Tambah influencer", description: "Simpan profil KOL untuk kolaborasi Instagram, Facebook, atau TikTok." },
  transaction: { title: "Catat transaksi", description: "Dokumentasikan rencana dan realisasi pengeluaran marketing." },
  profile: { title: "Edit profil saya", description: "Peran CMO hanya dapat diubah oleh admin." },
  password: { title: "Ganti kata sandi", description: "Gunakan kata sandi yang kuat dan mudah diingat." },
  user: { title: "Tambah pengguna", description: "Berikan akses sesuai tanggung jawab anggota tim." },
  metrics: { title: "Isi data sosial manual", description: "Gunakan saat konektor API belum diaktifkan." },
};

function AppModal({ type, data, close, notify, setData }: { type: string; data: AppData; close: () => void; notify: (message: string) => void; setData: React.Dispatch<React.SetStateAction<AppData>> }) {
  const info = modalInfo[type];
  if (!info) return null;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    setData((current) => applyModal(type, values, current));
    close();
    notify(successMessages[type] ?? "Perubahan berhasil disimpan.");
  };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="modal"><div className="modal-head"><div><h2>{info.title}</h2><p>{info.description}</p></div><button className="icon-button modal-close" onClick={close} aria-label="Tutup"><Icon name="close" /></button></div><form onSubmit={submit}>{formFields(type, data)}<div className="modal-actions">{type === "metrics" && <button type="button" className="button button-ghost" onClick={() => { setData(resetLocalData()); close(); notify("Data demo dikembalikan ke kondisi awal."); }}>Reset demo</button>}<button type="button" className="button button-ghost" onClick={close}>Batal</button><button type="submit" className="button button-primary">Simpan perubahan</button></div></form></section></div>;
}

function Field({ label, name, required, type = "text", defaultValue, placeholder }: { label: string; name: string; required?: boolean; type?: string; defaultValue?: string; placeholder?: string }) { return <div className="form-field"><label>{label}{required ? " *" : ""}</label><input className="modal-input" name={name} type={type} required={required} defaultValue={defaultValue} placeholder={placeholder} /></div>; }
function SelectField({ label, name, values }: { label: string; name: string; values: string[] }) { return <div className="form-field"><label>{label}</label><select className="modal-input" name={name}>{values.map((value) => <option key={value}>{value}</option>)}</select></div>; }

function formFields(type: string, data: AppData) {
  if (type === "task") return <div className="form-stack"><Field label="Judul tugas" name="title" required placeholder="Contoh: Finalisasi key visual" /><div className="two-fields"><SelectField label="PIC" name="pic" values={data.users.map((user) => user.name)} /><SelectField label="Brand" name="brand" values={["HBI", "HokBen"]} /></div><div className="two-fields"><Field label="Deadline" name="due" type="date" required defaultValue="2026-10-14" /><SelectField label="Prioritas" name="priority" values={["Sedang", "Tinggi", "Rendah"]} /></div></div>;
  if (type === "campaign") return <div className="form-stack"><Field label="Nama campaign" name="name" required /><div className="two-fields"><SelectField label="Brand" name="brand" values={["HBI", "HokBen"]} /><SelectField label="PIC" name="pic" values={data.users.map((user) => user.name)} /></div><Field label="Tujuan campaign" name="objective" required /><div className="two-fields"><Field label="Target / KPI" name="kpi" required /><Field label="Budget rencana" name="budget" type="number" /></div></div>;
  if (type === "content") return <div className="form-stack"><Field label="Judul konten" name="title" required /><div className="two-fields"><SelectField label="Brand" name="brand" values={["HBI", "HokBen"]} /><SelectField label="Platform" name="platform" values={["Instagram", "Facebook", "TikTok"]} /></div><Field label="Tanggal tayang" name="date" type="date" required defaultValue="2026-10-20" /><div className="form-field"><label>Caption / brief</label><textarea className="modal-input" name="caption" /></div></div>;
  if (type === "request") return <div className="form-stack"><Field label="Nama pengirim" name="sender" required /><div className="form-field"><label>Isi request / ide *</label><textarea className="modal-input" name="title" required /></div><div className="two-fields"><SelectField label="Brand" name="brand" values={["HBI", "HokBen"]} /><SelectField label="Prioritas" name="priority" values={["Sedang", "Tinggi", "Rendah"]} /></div></div>;
  if (type === "influencer") return <div className="form-stack"><Field label="Nama influencer" name="name" required /><div className="two-fields"><SelectField label="Platform" name="platform" values={["Instagram", "Facebook", "TikTok"]} /><Field label="Niche" name="niche" /></div><div className="two-fields"><Field label="Rate card" name="rate" type="number" /><Field label="Followers" name="followers" /></div></div>;
  if (type === "transaction") return <div className="form-stack"><Field label="Vendor" name="vendor" required /><div className="two-fields"><SelectField label="Kategori" name="category" values={["Digital Ads", "KOL & Influencer", "Produksi Konten", "Event & Aktivasi"]} /><Field label="Jumlah" name="amount" type="number" required /></div><div className="two-fields"><SelectField label="Tipe" name="transactionType" values={["Realisasi", "Rencana"]} /><SelectField label="Brand" name="brand" values={["HBI", "HokBen"]} /></div></div>;
  if (type === "user") return <div className="form-stack"><Field label="Nama lengkap" name="name" required /><Field label="Email" name="email" type="email" required /><SelectField label="Peran" name="role" values={["Creative Designer", "Support Marketing", "Tim Konten", "Guest"]} /></div>;
  if (type === "profile") return <div className="form-stack"><Field label="Nama lengkap" name="name" defaultValue="Andi Saputra" /><Field label="Posisi" name="position" defaultValue="Chief Marketing Officer" /></div>;
  if (type === "password") return <div className="form-stack"><Field label="Kata sandi lama" name="oldPassword" type="password" required /><Field label="Kata sandi baru" name="newPassword" type="password" required /></div>;
  return <div className="form-stack"><SelectField label="Platform" name="platform" values={["Instagram", "Facebook", "TikTok"]} /><div className="two-fields"><Field label="Followers" name="followers" type="number" required /><Field label="Reach" name="reach" type="number" required /></div><div className="two-fields"><Field label="Impressions" name="impressions" type="number" required /><Field label="Engagement (%)" name="engagement" type="number" required /></div><Field label="Video views" name="views" type="number" required /></div>;
}

const successMessages: Record<string, string> = { task: "Tugas baru berhasil ditambahkan.", campaign: "Campaign baru dibuat sebagai Rencana.", content: "Konten masuk ke kalender sebagai Draf.", request: "Request baru berhasil dicatat.", influencer: "Influencer berhasil ditambahkan.", transaction: "Transaksi berhasil dicatat.", user: "Pengguna baru berhasil ditambahkan.", password: "Kata sandi berhasil diganti.", profile: "Profil berhasil diperbarui.", metrics: "Data sosial manual berhasil disimpan." };

function applyModal(type: string, values: Record<string, FormDataEntryValue>, current: AppData): AppData {
  const value = (key: string) => String(values[key] ?? "");
  if (type === "task") { const task: Task = { id: Date.now(), title: value("title"), brand: value("brand"), pic: value("pic"), due: value("due"), priority: value("priority"), status: "Backlog", campaign: null }; return { ...current, tasks: [...current.tasks, task] }; }
  if (type === "campaign") return { ...current, campaigns: [{ id: Date.now(), name: value("name"), brand: value("brand"), pic: value("pic"), period: "Oktober — November 2026", status: "Rencana", progress: 0, budget: Number(value("budget")), spent: 0, kpi: value("kpi"), tasks: 0, content: 0 }, ...current.campaigns] };
  if (type === "content") { const item: ContentItem = { id: Date.now(), title: value("title"), date: Number(value("date").slice(-2)), status: "Draf", brand: value("brand"), platform: value("platform") as ContentItem["platform"] }; return { ...current, content: [...current.content, item] }; }
  if (type === "request") return { ...current, requests: [{ id: Date.now(), title: value("title"), sender: value("sender"), date: "10 Okt 2026", brand: value("brand"), priority: value("priority"), status: "Baru", icon: "✦" }, ...current.requests] };
  if (type === "influencer") { const item: Influencer = { name: value("name"), platform: value("platform") as Influencer["platform"], niche: value("niche") || "Belum diisi", rate: Number(value("rate")), followers: value("followers") || "—", engagement: "—", status: "Review" }; return { ...current, influencers: [...current.influencers, item] }; }
  if (type === "transaction") { const item: Transaction = { vendor: value("vendor"), category: value("category"), amount: Number(value("amount")), type: value("transactionType"), brand: value("brand"), date: "10 Okt 2026", status: "Belum Dibayar" }; return { ...current, transactions: [item, ...current.transactions] }; }
  if (type === "user") { const user: User = { name: value("name"), email: value("email"), role: value("role"), status: "Aktif" }; return { ...current, users: [...current.users, user] }; }
  if (type === "metrics") { const platform = value("platform").toLowerCase() as "instagram" | "facebook" | "tiktok"; const snapshot = { platform, date: "10 Okt", followers: Number(value("followers")), reach: Number(value("reach")), impressions: Number(value("impressions")), engagementRate: Number(value("engagement")), views: Number(value("views")) }; return { ...current, socialSnapshots: [...current.socialSnapshots.filter((item) => !(item.platform === platform && item.date === "10 Okt")), snapshot], socialAccounts: current.socialAccounts.map((account) => account.platform === platform ? { ...account, followers: snapshot.followers, lastSync: "Input manual · baru saja" } : account) }; }
  return current;
}
