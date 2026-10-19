"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { AppData, ContentItem, Influencer, InfluencerSchedule, Task, Transaction, User, UserIdentity, ViewName } from "@/lib/types";
import { demoData } from "@/lib/demo-data";
import { loadLocalData, resetLocalData, saveLocalData } from "@/lib/storage";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { loadWorkspaceData, saveWorkspaceData } from "@/lib/supabase/workspace-data";
import { authEmailFromUsername, isValidPin, normalizeUsername } from "@/lib/auth-identity";
import { createBasicCampaign, validateCampaignPeriod } from "@/lib/campaign-form";
import { demoAccount, demoAccountCredentials } from "@/lib/demo-account";
import { AccountView, AnalyticsView, CalendarView, CampaignsView, DashboardView, InfluencerScheduleView, PartnersView, RequestsView, TodoView } from "./views";
import { SocialHubView } from "./social-hub";
import { Avatar, Icon } from "./ui";

const navigation: Array<{ group?: string; view: ViewName; label: string; icon: string; count?: string }> = [
  { group: "WORKSPACE", view: "dashboard", label: "Dashboard", icon: "home" },
  { view: "campaigns", label: "Campaign", icon: "campaign", count: "4" },
  { view: "todo", label: "To-Do", icon: "check-square", count: "12" },
  { group: "OPERASIONAL", view: "calendar", label: "Kalender Konten", icon: "calendar" },
  { view: "requests", label: "Request & Ide", icon: "sparkles", count: "3" },
  { view: "partners", label: "Mitra & Keuangan", icon: "handshake" },
  { view: "influencer-schedule", label: "Jadwal Influencer", icon: "calendar", count: "2" },
  { view: "analytics", label: "Analitik Sosmed", icon: "chart" },
  { view: "social-hub", label: "Social Hub", icon: "instagram" },
  { group: "AKUN", view: "account", label: "Akun & Keamanan", icon: "users" },
];

const titles: Record<ViewName, string> = { dashboard: "Dashboard", campaigns: "Campaign", todo: "To-Do", calendar: "Kalender Konten", requests: "Request & Ide", partners: "Mitra & Keuangan", "influencer-schedule": "Jadwal Influencer", analytics: "Analitik Sosmed", "social-hub": "Social Hub", account: "Akun & Keamanan" };

export function AppShell() {
  const [view, setView] = useState<ViewName>("dashboard");
  const [data, setData] = useState<AppData>(() => structuredClone(demoData));
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modal, setModal] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; actionLabel?: string; action?: () => void } | null>(null);
  const [authMode, setAuthMode] = useState<"loading" | "signed-out" | "demo" | "live">("loading");
  const [identity, setIdentity] = useState<UserIdentity>(demoAccount);
  const [liveContext, setLiveContext] = useState<{ workspaceId: string; userId: string } | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [requestedCampaignId, setRequestedCampaignId] = useState<string | null>(null);
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const hydrated = useRef(false);

  const connectLiveWorkspace = useCallback(async (accessToken: string, userId: string, email: string) => {
    if (!supabase) throw new Error("Koneksi Supabase belum tersedia.");
    const response = await fetch("/api/bootstrap", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const result = await response.json() as { workspaceId?: string; profile?: { name: string; username: string; email: string; whatsapp: string; role: string; accessRole?: UserIdentity["accessRole"] }; error?: string };
    if (!response.ok || !result.workspaceId) throw new Error(result.error || "Workspace gagal disiapkan.");

    const profileEmail = result.profile?.email || email;
    const liveData = await loadWorkspaceData(supabase, result.workspaceId, structuredClone(demoData), profileEmail);
    setIdentity({
      name: result.profile?.name || profileEmail.split("@")[0],
      username: result.profile?.username || "",
      email: profileEmail,
      whatsapp: result.profile?.whatsapp || "",
      role: result.profile?.role || "member",
      accessRole: result.profile?.accessRole || "member",
    });
    setData(liveData);
    setLiveContext({ workspaceId: result.workspaceId, userId });
    hydrated.current = true;
    setAuthMode("live");
  }, [supabase]);

  useEffect(() => {
    setTheme(window.localStorage.getItem("ngapaya-theme") === "dark" ? "dark" : "light");
    setCollapsed(window.localStorage.getItem("ngapaya-sidebar-collapsed") === "true");

    if (!supabase) {
      setData(loadLocalData());
      hydrated.current = true;
      setAuthMode("signed-out");
      return;
    }

    let active = true;
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: userData } = await supabase.auth.getUser();
      if (!active) return;
      if (!sessionData.session || !userData.user) {
        setAuthMode("signed-out");
        return;
      }
      try {
        await connectLiveWorkspace(sessionData.session.access_token, userData.user.id, userData.user.email || "");
      } catch (error) {
        setToast({ message: error instanceof Error ? error.message : "Supabase gagal dimuat." });
        setAuthMode("signed-out");
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setLiveContext(null);
        setAuthMode("signed-out");
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [connectLiveWorkspace, supabase]);

  useEffect(() => {
    if (!hydrated.current) return;
    if (authMode === "demo") saveLocalData(data);
    if (authMode !== "live" || !liveContext || !supabase) return;

    const timer = window.setTimeout(() => {
      void saveWorkspaceData(supabase, liveContext.workspaceId, liveContext.userId, data)
        .catch((error) => {
          setToast({ message: error instanceof Error ? `Gagal menyimpan: ${error.message}` : "Gagal menyimpan ke Supabase." });
        });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [authMode, data, liveContext, supabase]);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", theme === "dark");
    window.localStorage.setItem("ngapaya-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    window.localStorage.setItem("ngapaya-sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  const notify = (message: string) => {
    if (message === "logout") {
      setLiveContext(null);
      setAuthMode("signed-out");
      if (supabase) void supabase.auth.signOut();
      return;
    }
    setToast({ message });
    window.setTimeout(() => setToast(null), 3200);
  };
  const notifyAction = (message: string, actionLabel: string, action: () => void) => {
    setToast({ message, actionLabel, action });
    window.setTimeout(() => setToast(null), 6000);
  };
  const navigate = (target: string) => { setView(target as ViewName); setSidebarOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const openResetPin = (user: User) => { setResetUser(user); setModal("resetPin"); };
  const closeModal = () => { setModal(null); setResetUser(null); };
  const resetPin = async (username: string, pin: string) => {
    if (!supabase) throw new Error("Reset PIN hanya tersedia saat Supabase aktif.");
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("Sesi login tidak ditemukan.");
    const response = await fetch("/api/auth/reset-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ username, pin }),
    });
    const result = await response.json() as { error?: string; message?: string };
    if (!response.ok) throw new Error(result.error || "PIN gagal direset.");
  };
  const createUser = async (input: { name: string; username: string; email: string; whatsapp: string; role: string; pin: string }) => {
    if (!supabase || !liveContext) {
      const user: User = { name: input.name, username: input.username, email: input.email, whatsapp: input.whatsapp, role: input.role, status: "Aktif" };
      setData((current) => ({ ...current, users: [...current.users, user] }));
      return;
    }
    const token = await getAccessToken();
    if (!token) throw new Error("Sesi login tidak ditemukan.");
    const response = await fetch("/api/auth/create-user", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ workspaceId: liveContext.workspaceId, fullName: input.name, username: input.username, email: input.email, whatsapp: input.whatsapp, role: input.role, pin: input.pin }) });
    const result = await response.json() as { user?: User; error?: string };
    if (!response.ok || !result.user) throw new Error(result.error || "Anggota gagal dibuat.");
    setData((current) => ({ ...current, users: [...current.users, result.user as User] }));
  };
  const changePin = async (pin: string) => {
    if (!supabase) throw new Error("Ganti PIN hanya tersedia saat Supabase aktif.");
    if (!isValidPin(pin)) throw new Error("PIN harus terdiri dari 6 angka.");
    const { error } = await supabase.auth.updateUser({ password: pin });
    if (error) throw error;
  };
  const updateProfile = async (name: string, email: string, whatsapp: string) => {
    const nextIdentity = { ...identity, name: name.trim(), email: email.trim().toLowerCase(), whatsapp: whatsapp.trim() };
    if (supabase && liveContext) {
      const { error } = await supabase.from("profiles").update({
        full_name: nextIdentity.name,
        email: nextIdentity.email,
        whatsapp: nextIdentity.whatsapp,
        updated_at: new Date().toISOString(),
      }).eq("id", liveContext.userId);
      if (error) throw error;
    }
    setIdentity(nextIdentity);
    setData((current) => ({ ...current, users: current.users.map((user) => user.username === identity.username ? { ...user, name: nextIdentity.name, email: nextIdentity.email, whatsapp: nextIdentity.whatsapp } : user) }));
  };
  const getAccessToken = useCallback(async () => {
    if (!supabase) return null;
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData.session?.access_token || null;
  }, [supabase]);
  const refreshData = useCallback(async () => {
    if (!supabase || !liveContext) return;
    const liveData = await loadWorkspaceData(supabase, liveContext.workspaceId, structuredClone(demoData), identity.email);
    setData(liveData);
  }, [identity.email, liveContext, supabase]);
  const uploadMedia = useCallback(async (file: File) => {
    if (!supabase || !liveContext) throw new Error("Upload media hanya tersedia saat Supabase aktif.");
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
    const path = `${liveContext.workspaceId}/${globalThis.crypto.randomUUID()}-${safeName}`;
    const upload = await supabase.storage.from("social-media").upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (upload.error) throw upload.error;
    const publicUrl = supabase.storage.from("social-media").getPublicUrl(path).data.publicUrl;
    if (!publicUrl) throw new Error("URL media publik gagal dibuat.");
    return publicUrl;
  }, [liveContext, supabase]);
  const campaignLifecycleAction = useCallback(async (campaignId: string | number, action: "archive" | "unarchive" | "trash" | "restore" | "permanent-delete", pin?: string) => {
    if (!supabase || !liveContext) {
      if (action === "permanent-delete") throw new Error("Hapus permanen hanya tersedia saat Supabase aktif agar verifikasi PIN dilakukan di server.");
      const now = new Date().toISOString();
      setData((current) => ({ ...current, campaigns: current.campaigns.map((campaign) => {
        if (String(campaign.id) !== String(campaignId)) return campaign;
        if (action === "archive") return { ...campaign, lifecycleStatus: "archived", archivedAt: now };
        if (action === "unarchive") return { ...campaign, lifecycleStatus: "active", archivedAt: null, archivedBy: null };
        if (action === "trash") return { ...campaign, lifecycleStatus: "trashed", previousLifecycleStatus: campaign.lifecycleStatus === "archived" ? "archived" : "active", deletedAt: now };
        return { ...campaign, lifecycleStatus: campaign.previousLifecycleStatus || "active", deletedAt: null, deletedBy: null, previousLifecycleStatus: null };
      }) }));
      return;
    }
    const token = await getAccessToken();
    if (!token) throw new Error("Sesi login tidak ditemukan.");
    const response = await fetch(`/api/campaigns/${campaignId}/lifecycle`, {
      method: action === "permanent-delete" ? "DELETE" : "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(action === "permanent-delete" ? { pin } : { action }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error || "Lifecycle campaign gagal diperbarui.");
    if (action === "permanent-delete") setData((current) => ({ ...current, campaigns: current.campaigns.filter((campaign) => String(campaign.id) !== String(campaignId)) }));
    else await refreshData();
  }, [getAccessToken, liveContext, refreshData, supabase]);
  const common = { data, identity, openModal: setModal, openResetPin, navigate, notify, notifyAction, setData, getAccessToken, refreshData, campaignLifecycleAction, requestedCampaignId, onCampaignOpened: () => setRequestedCampaignId(null), uploadMedia, workspaceId: liveContext?.workspaceId, liveMode: Boolean(supabase && liveContext) };

  const authenticate = async (action: "login" | "signup", name: string, username: string, email: string, whatsapp: string, pin: string) => {
    if (!supabase) {
      if (action !== "login" || normalizeUsername(username) !== demoAccountCredentials.username || pin !== demoAccountCredentials.pin) {
        throw new Error("Akun demo tidak cocok. Gunakan username demo.superadmin dan PIN 123456.");
      }
      setIdentity(demoAccount);
      setData(loadLocalData());
      setAuthMode("demo");
      return "Mode demo aktif. Data disimpan hanya di browser ini.";
    }

    if (action === "signup") {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, fullName: name, email, whatsapp, pin }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Akun gagal dibuat.");
    }

    const { data: signInData, error } = await supabase.auth.signInWithPassword({ email: authEmailFromUsername(username), password: pin });
    if (error) throw error;
    if (!signInData.session || !signInData.user) throw new Error("Sesi login tidak berhasil dibuat.");
    setAuthMode("loading");
    await connectLiveWorkspace(signInData.session.access_token, signInData.user.id, email);
  };

  if (authMode === "loading") return <div className="login-screen auth-loading"><div className="brand-mark">N</div><strong>Menyiapkan workspace…</strong></div>;
  if (authMode === "signed-out") return <LoginScreen configured={isSupabaseConfigured()} onAuthenticate={authenticate} />;

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} id="sidebar">
      <div className="brand-wrap"><div className="brand-mark">N</div><div className="brand-copy"><div className="brand-name">ngapaya</div><div className="brand-subtitle">Marketing OS</div></div><button className="icon-button sidebar-collapse" onClick={() => setCollapsed(!collapsed)} aria-label="Ciutkan sidebar"><Icon name="panel" /></button><button className="icon-button close-sidebar" onClick={() => setSidebarOpen(false)} aria-label="Tutup menu"><Icon name="close" /></button></div>
      <div className="workspace-switcher soft-inset"><div className="workspace-avatar">H</div><div className="workspace-copy"><strong>HBI Marketing</strong><span>Workspace utama</span></div><span className="chevron">⌄</span></div>
      <nav className="main-nav" aria-label="Navigasi utama">{navigation.map((item) => <div key={item.view}>{item.group && <div className={`nav-label ${item.group !== "WORKSPACE" ? "nav-gap" : ""}`}>{item.group}</div>}<button className={`nav-item ${view === item.view ? "active" : ""}`} onClick={() => navigate(item.view)}><Icon className="nav-icon" name={item.icon} size={17} /><span>{item.label}</span>{item.view === "campaigns" ? <span className="nav-count">{data.campaigns.filter((campaign) => (campaign.lifecycleStatus || "active") === "active").length}</span> : item.count && <span className="nav-count">{item.count}</span>}</button></div>)}</nav>
      <div className="sidebar-bottom"><div className="user-mini"><Avatar name={identity.name} /><div className="user-mini-copy"><strong>{identity.name}</strong><span>{identity.role} · HBI</span></div><button className="icon-button" onClick={() => navigate("account")}><Icon name="more-horizontal" /></button></div></div>
    </aside>
    <button className={`sidebar-backdrop ${sidebarOpen ? "visible" : ""}`} onClick={() => setSidebarOpen(false)} aria-label="Tutup menu" />
    <main className="main-area"><header className="topbar"><div className="topbar-left"><button className="icon-button menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Buka menu"><Icon name="menu" /></button><div className="crumbs"><span>Workspace</span><b>/</b><strong>{titles[view]}</strong></div></div><div className="topbar-actions"><label className="search-box"><Icon name="search" /><input type="search" placeholder="Cari apa saja..." aria-label="Cari di workspace" onKeyDown={(event) => { if (event.key === "Enter") notify(`Pencarian “${event.currentTarget.value}” siap digunakan.`); }} /></label><button className="icon-button theme-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Ubah tema"><Icon name={theme === "dark" ? "sun" : "moon"} /></button><button className="icon-button notification-button" onClick={() => notify("Tidak ada notifikasi baru.")} aria-label="Notifikasi"><Icon name="bell" /><i /></button><button className="top-profile" onClick={() => navigate("account")}><Avatar name={identity.name} /><span className="top-profile-copy"><strong>{identity.name}</strong><small>{identity.role}</small></span><span className="chevron">⌄</span></button></div></header>
      <div className="page-content">{view === "dashboard" && <DashboardView {...common} />}{view === "campaigns" && <CampaignsView {...common} />}{view === "todo" && <TodoView {...common} />}{view === "calendar" && <CalendarView {...common} />}{view === "requests" && <RequestsView {...common} />}{view === "partners" && <PartnersView {...common} />}{view === "influencer-schedule" && <InfluencerScheduleView {...common} />}{view === "analytics" && <AnalyticsView {...common} />}{view === "social-hub" && <SocialHubView {...common} />}{view === "account" && <AccountView {...common} />}</div>
    </main>
    <div className={`toast ${toast ? "show" : ""}`} role="status">{toast?.message}{toast?.action && <button type="button" onClick={() => { toast.action?.(); setToast(null); }}>{toast.actionLabel}</button>}</div>
    {modal && <AppModal type={modal} data={data} close={closeModal} identity={identity} notify={notify} resetPin={resetPin} resetUser={resetUser} changePin={changePin} updateProfile={updateProfile} createUser={createUser} setData={setData} onCampaignCreated={(campaignId) => { setRequestedCampaignId(campaignId); setView("campaigns"); }} />}
  </div>;
}

function LoginScreen({ configured, onAuthenticate }: { configured: boolean; onAuthenticate: (action: "login" | "signup", name: string, username: string, email: string, whatsapp: string, pin: string) => Promise<string | void> }) {
  const [action, setAction] = useState<"login" | "signup">("login");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const values = new FormData(event.currentTarget);
    const pin = String(values.get("pin") || "");
    try {
      if (action === "signup" && pin !== String(values.get("pinConfirmation") || "")) throw new Error("Konfirmasi PIN tidak sama.");
      const result = await onAuthenticate(action, String(values.get("name") || ""), String(values.get("username") || ""), String(values.get("email") || ""), String(values.get("whatsapp") || ""), pin);
      if (result) setMessage(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Autentikasi gagal. Silakan coba lagi.");
    } finally {
      setPending(false);
    }
  };

  return <div className="login-screen" style={{ display: "grid" }}><div className="card login-card"><div className="brand-mark">N</div><h1>{action === "login" ? "Selamat datang kembali" : "Buat akun Ngapaya"}</h1><p>Satu ruang kerja untuk seluruh kegiatan marketing HBI.<br />{action === "login" ? "Masuk dengan username dan PIN." : "Lengkapi profil untuk membuat akses workspace."}</p><form className="form-stack" onSubmit={submit}>{action === "signup" && <div className="form-field"><label>Nama lengkap</label><input className="input" name="name" required autoComplete="name" /></div>}<div className="form-field"><label>Username</label><input className="input" name="username" required minLength={3} maxLength={32} pattern="[a-z][a-z0-9._-]{2,31}" autoCapitalize="none" autoComplete="username" placeholder="contoh: andi.saputra" /></div>{action === "signup" && <><div className="form-field"><label>Email profil</label><input className="input" name="email" type="email" required autoComplete="email" /></div><div className="form-field"><label>Nomor WhatsApp</label><input className="input" name="whatsapp" type="tel" required autoComplete="tel" placeholder="08xxxxxxxxxx" /></div></>}<div className="form-field"><label>PIN 6 angka</label><input className="input" name="pin" type="password" required minLength={6} maxLength={6} pattern="[0-9]{6}" inputMode="numeric" autoComplete={action === "login" ? "current-password" : "new-password"} /></div>{action === "signup" && <div className="form-field"><label>Ulangi PIN</label><input className="input" name="pinConfirmation" type="password" required minLength={6} maxLength={6} pattern="[0-9]{6}" inputMode="numeric" autoComplete="new-password" /></div>}<button className="button button-primary" type="submit" disabled={pending}>{pending ? "Memproses…" : action === "login" ? "Masuk ke workspace ↗" : "Buat akun ↗"}</button></form>{message && <div className="auth-message" role="status">{message}</div>}{action === "login" && <div className="auth-help">Lupa PIN? Hubungi Super Admin atau CMO untuk reset PIN.</div>}{configured && <button className="auth-switch" type="button" onClick={() => { setAction(action === "login" ? "signup" : "login"); setMessage(""); }}>{action === "login" ? "Belum punya akun? Buat akun" : "Sudah punya akun? Masuk"}</button>}<div className="demo-hint">{configured ? "Login aman dengan username + PIN melalui Supabase" : <>Mode demo lokal · Username: <strong>{demoAccountCredentials.username}</strong> · PIN: <strong>{demoAccountCredentials.pin}</strong></>}</div></div></div>;
}

const modalInfo: Record<string, { title: string; description: string }> = {
  task: { title: "Tambah tugas baru", description: "Buat tugas dan pastikan PIC serta deadline-nya jelas." },
  campaign: { title: "Buat Campaign Baru", description: "Mulai dari informasi dasar. Detail bisa dilengkapi nanti." },
  content: { title: "Jadwalkan konten", description: "Konten baru akan masuk kalender dengan status Draf." },
  request: { title: "Buat request / ide", description: "Catat masukan agar bisa ditindaklanjuti dengan jelas." },
  influencer: { title: "Tambah influencer", description: "Simpan profil KOL untuk kolaborasi Instagram, Facebook, atau TikTok." },
  influencerSchedule: { title: "Jadwalkan kerja sama influencer", description: "Catat deliverable, rate, spent, dan status pembayaran dalam satu jadwal." },
  transaction: { title: "Catat transaksi", description: "Dokumentasikan rencana dan realisasi pengeluaran marketing." },
  profile: { title: "Edit profil saya", description: "Peran CMO hanya dapat diubah oleh admin." },
  password: { title: "Ganti PIN", description: "PIN baru harus terdiri dari 6 angka." },
  resetPin: { title: "Reset PIN anggota", description: "Gunakan fitur ini hanya jika Anda adalah Super Admin atau CMO." },
  user: { title: "Tambah pengguna", description: "Berikan akses sesuai tanggung jawab anggota tim." },
  metrics: { title: "Isi data sosial manual", description: "Gunakan saat konektor API belum diaktifkan." },
};

function AppModal({ type, data, close, identity, notify, resetPin, resetUser, changePin, updateProfile, createUser, setData, onCampaignCreated }: { type: string; data: AppData; close: () => void; identity: UserIdentity; notify: (message: string) => void; resetPin: (username: string, pin: string) => Promise<void>; resetUser: User | null; changePin: (pin: string) => Promise<void>; updateProfile: (name: string, email: string, whatsapp: string) => Promise<void>; createUser: (input: { name: string; username: string; email: string; whatsapp: string; role: string; pin: string }) => Promise<void>; setData: React.Dispatch<React.SetStateAction<AppData>>; onCampaignCreated: (campaignId: string) => void }) {
  const info = modalInfo[type];
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState("");
  if (!info) return null;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    setPending(true);
    setFormError("");
    try {
      if (type === "resetPin") await resetPin(String(values.username || ""), String(values.pin || ""));
      else if (type === "password") await changePin(String(values.pin || ""));
      else if (type === "profile") await updateProfile(String(values.name || ""), String(values.email || ""), String(values.whatsapp || ""));
      else if (type === "user") await createUser({ name: String(values.name || ""), username: String(values.username || ""), email: String(values.email || ""), whatsapp: String(values.whatsapp || ""), role: String(values.role || ""), pin: String(values.pin || "") });
      else if (type === "campaign") {
        const name = String(values.name || "").trim();
        const brand = String(values.brand || "").trim();
        const startDate = String(values.startDate || "");
        const endDate = String(values.endDate || "");
        const brands = existingBrands(data);
        if (!name) throw new Error("Nama Campaign wajib diisi.");
        if (!brand || !brands.includes(brand)) throw new Error("Pilih Brand dari data yang tersedia.");
        const periodError = validateCampaignPeriod(startDate, endDate);
        if (periodError) throw new Error(periodError);
        const id = globalThis.crypto.randomUUID();
        const campaign = createBasicCampaign(id, { name, brand, startDate, endDate, objective: String(values.objective || "") });
        setData((current) => ({ ...current, campaigns: [campaign, ...current.campaigns] }));
        close();
        notify("Campaign baru dibuat sebagai Rencana.");
        onCampaignCreated(id);
        return;
      } else setData((current) => applyModal(type, values, current));
      close();
      notify(successMessages[type] ?? "Perubahan berhasil disimpan.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Perubahan gagal disimpan.";
      if (type === "campaign") setFormError(message);
      else notify(message);
    } finally {
      setPending(false);
    }
  };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) close(); }}><section className={`modal ${type === "campaign" ? "campaign-create-modal" : ""}`}><div className="modal-head"><div><h2>{info.title}</h2><p>{info.description}</p></div><button type="button" className="icon-button modal-close" onClick={close} aria-label="Tutup" disabled={pending}><Icon name="close" /></button></div><form onSubmit={submit}>{formFields(type, data, resetUser, identity)}{formError && <div className="campaign-form-error" role="alert"><Icon name="alert" size={14} />{formError}</div>}<div className="modal-actions">{type === "metrics" && <button type="button" className="button button-ghost" onClick={() => { setData(resetLocalData()); close(); notify("Data demo dikembalikan ke kondisi awal."); }}>Reset demo</button>}<button type="button" className="button button-ghost" onClick={close} disabled={pending}>Batal</button><button type="submit" className="button button-primary" disabled={pending}>{pending ? "Membuat…" : type === "campaign" ? "Buat Campaign" : "Simpan perubahan"}</button></div></form></section></div>;
}

function Field({ label, name, required, type = "text", defaultValue, placeholder, minLength, maxLength, pattern, inputMode, autoComplete, readOnly }: { label: string; name: string; required?: boolean; type?: string; defaultValue?: string; placeholder?: string; minLength?: number; maxLength?: number; pattern?: string; inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search"; autoComplete?: string; readOnly?: boolean }) { return <div className="form-field"><label>{label}{required ? " *" : ""}</label><input className="modal-input" name={name} type={type} required={required} defaultValue={defaultValue} placeholder={placeholder} minLength={minLength} maxLength={maxLength} pattern={pattern} inputMode={inputMode} autoComplete={autoComplete} readOnly={readOnly} /></div>; }
function SelectField({ label, name, values, required = false, placeholder }: { label: string; name: string; values: string[]; required?: boolean; placeholder?: string }) { return <div className="form-field"><label>{label}{required ? " *" : ""}</label><select className="modal-input" name={name} required={required} defaultValue={placeholder ? "" : values[0]}>{placeholder && <option value="" disabled>{placeholder}</option>}{values.map((value) => <option key={value}>{value}</option>)}</select></div>; }

function existingBrands(data: AppData) {
  return Array.from(new Set([
    ...data.campaigns.map((item) => item.brand),
    ...data.content.map((item) => item.brand),
    ...data.requests.map((item) => item.brand),
    ...data.transactions.map((item) => item.brand),
  ].map((brand) => brand.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right, "id"));
}

function formFields(type: string, data: AppData, resetUser: User | null = null, identity: UserIdentity | null = null) {
  if (type === "task") return <div className="form-stack"><Field label="Judul tugas" name="title" required placeholder="Contoh: Finalisasi key visual" /><div className="two-fields"><SelectField label="PIC" name="pic" values={data.users.map((user) => user.name)} /><SelectField label="Brand" name="brand" values={["HBI", "HokBen"]} /></div><div className="two-fields"><Field label="Deadline" name="due" type="date" required defaultValue="2026-10-14" /><SelectField label="Prioritas" name="priority" values={["Sedang", "Tinggi", "Rendah"]} /></div></div>;
  if (type === "campaign") return <div className="form-stack campaign-create-fields"><Field label="Nama Campaign" name="name" required placeholder="Contoh: Grand Opening RUMA Purwokerto" /><SelectField label="Brand" name="brand" values={existingBrands(data)} required placeholder="Pilih brand" /><div className="campaign-form-group"><div><strong>Periode Campaign</strong><span>Opsional, dapat diatur nanti.</span></div><div className="two-fields"><Field label="Tanggal mulai" name="startDate" type="date" /><Field label="Tanggal selesai" name="endDate" type="date" /></div></div><div className="form-field"><label>Tujuan Singkat</label><textarea className="modal-input campaign-objective-input" name="objective" maxLength={280} placeholder="Apa tujuan utama campaign ini?" /></div><div className="campaign-create-note"><Icon name="info" size={15} /><span>Brief, KPI, promo, timeline, tugas, influencer, dan budget dapat dilengkapi melalui Campaign Workspace setelah dibuat.</span></div></div>;
  if (type === "content") return <div className="form-stack"><Field label="Judul konten" name="title" required /><div className="two-fields"><SelectField label="Brand" name="brand" values={["HBI", "HokBen"]} /><SelectField label="Platform" name="platform" values={["Instagram", "Facebook", "Threads", "TikTok"]} /></div><Field label="Tanggal tayang" name="date" type="date" required defaultValue="2026-10-20" /><div className="form-field"><label>Caption / brief</label><textarea className="modal-input" name="caption" /></div></div>;
  if (type === "request") return <div className="form-stack"><Field label="Nama pengirim" name="sender" required /><div className="form-field"><label>Isi request / ide *</label><textarea className="modal-input" name="title" required /></div><div className="two-fields"><SelectField label="Brand" name="brand" values={["HBI", "HokBen"]} /><SelectField label="Prioritas" name="priority" values={["Sedang", "Tinggi", "Rendah"]} /></div></div>;
  if (type === "influencer") return <div className="form-stack"><Field label="Nama influencer" name="name" required /><div className="two-fields"><SelectField label="Platform" name="platform" values={["Instagram", "Facebook", "TikTok"]} /><Field label="Niche" name="niche" /></div><div className="two-fields"><Field label="Rate card" name="rate" type="number" /><Field label="Followers" name="followers" /></div></div>;
  if (type === "influencerSchedule") return <div className="form-stack"><div className="two-fields"><SelectField label="Influencer / selebgram" name="influencer" values={data.influencers.map((item) => item.name)} /><SelectField label="Platform" name="platform" values={["Instagram", "Facebook", "TikTok"]} /></div><Field label="Judul konten / deliverable" name="content" required placeholder="Contoh: Reels promo menu baru" /><div className="two-fields"><SelectField label="Campaign" name="campaign" values={["Tanpa campaign", ...data.campaigns.filter((item) => (item.lifecycleStatus || "active") === "active").map((item) => item.name)]} /><Field label="Tanggal tayang" name="date" type="date" required defaultValue="2026-10-20" /></div><div className="two-fields"><Field label="Jam tayang" name="time" type="time" required defaultValue="19:00" /><SelectField label="Status kerja sama" name="status" values={["Terjadwal", "Draft", "Selesai", "Dibatalkan"]} /></div><div className="two-fields"><Field label="Rate / budget" name="rate" type="number" required /><Field label="Spent / realisasi" name="spent" type="number" required /></div><SelectField label="Status pembayaran" name="paymentStatus" values={["Belum dibayar", "DP dibayar", "Lunas"]} /><div className="form-field"><label>Catatan</label><textarea className="modal-input" name="notes" placeholder="Brief, link asset, atau catatan pembayaran" /></div></div>;
  if (type === "transaction") return <div className="form-stack"><Field label="Vendor" name="vendor" required /><div className="two-fields"><SelectField label="Kategori" name="category" values={["Digital Ads", "KOL & Influencer", "Produksi Konten", "Event & Aktivasi"]} /><Field label="Jumlah" name="amount" type="number" required /></div><div className="two-fields"><SelectField label="Tipe" name="transactionType" values={["Realisasi", "Rencana"]} /><SelectField label="Brand" name="brand" values={["HBI", "HokBen"]} /></div></div>;
  if (type === "user") return <div className="form-stack"><Field label="Nama lengkap" name="name" required /><Field label="Username" name="username" required minLength={3} maxLength={32} pattern="[a-z][a-z0-9._-]{2,31}" /><Field label="Email profil" name="email" type="email" required /><Field label="Nomor WhatsApp" name="whatsapp" type="tel" required /><Field label="PIN awal" name="pin" type="password" required minLength={6} maxLength={6} pattern="[0-9]{6}" inputMode="numeric" autoComplete="new-password" /><SelectField label="Peran" name="role" values={["Content Creator", "Creative Designer", "Support Marketing", "Tim Konten", "Guest"]} /></div>;
  if (type === "profile") return <div className="form-stack"><Field label="Nama lengkap" name="name" required defaultValue={identity?.name} /><Field label="Username" name="username" defaultValue={identity?.username} readOnly /><Field label="Email profil" name="email" type="email" required defaultValue={identity?.email} /><Field label="Nomor WhatsApp" name="whatsapp" type="tel" required defaultValue={identity?.whatsapp} /></div>;
  if (type === "password") return <div className="form-stack"><Field label="PIN baru" name="pin" type="password" required minLength={6} maxLength={6} pattern="[0-9]{6}" inputMode="numeric" autoComplete="new-password" /></div>;
  if (type === "resetPin") return <div className="form-stack"><Field label="Username anggota" name="username" required defaultValue={resetUser?.username} readOnly={Boolean(resetUser?.username)} /><Field label="PIN baru" name="pin" type="password" required minLength={6} maxLength={6} pattern="[0-9]{6}" inputMode="numeric" autoComplete="new-password" /></div>;
  return <div className="form-stack"><SelectField label="Platform" name="platform" values={["Instagram", "Facebook", "Threads", "TikTok"]} /><div className="two-fields"><Field label="Followers" name="followers" type="number" required /><Field label="Reach" name="reach" type="number" required /></div><div className="two-fields"><Field label="Impressions" name="impressions" type="number" required /><Field label="Engagement (%)" name="engagement" type="number" required /></div><Field label="Video views" name="views" type="number" required /></div>;
}

const successMessages: Record<string, string> = { task: "Tugas baru berhasil ditambahkan.", campaign: "Campaign baru dibuat sebagai Rencana.", content: "Konten masuk ke kalender sebagai Draf.", request: "Request baru berhasil dicatat.", influencer: "Influencer berhasil ditambahkan.", influencerSchedule: "Jadwal influencer berhasil disimpan.", transaction: "Transaksi berhasil dicatat.", user: "Pengguna baru berhasil ditambahkan.", password: "PIN berhasil diganti.", resetPin: "PIN anggota berhasil direset.", profile: "Profil berhasil diperbarui.", metrics: "Data sosial manual berhasil disimpan." };

function applyModal(type: string, values: Record<string, FormDataEntryValue>, current: AppData): AppData {
  const value = (key: string) => String(values[key] ?? "");
  if (type === "task") { const task: Task = { id: globalThis.crypto.randomUUID(), title: value("title"), brand: value("brand"), pic: value("pic"), due: value("due"), dueDate: value("due"), priority: value("priority"), status: "Backlog", campaign: null }; return { ...current, tasks: [...current.tasks, task] }; }
  if (type === "content") { const item: ContentItem = { id: globalThis.crypto.randomUUID(), title: value("title"), date: Number(value("date").slice(-2)), status: "Draf", brand: value("brand"), platform: value("platform") as ContentItem["platform"], scheduledAt: value("date") }; return { ...current, content: [...current.content, item] }; }
  if (type === "request") return { ...current, requests: [{ id: globalThis.crypto.randomUUID(), title: value("title"), sender: value("sender"), date: value("date") || new Date().toISOString().slice(0, 10), brand: value("brand"), priority: value("priority"), status: "Baru", icon: "✦" }, ...current.requests] };
  if (type === "influencer") { const item: Influencer = { id: globalThis.crypto.randomUUID(), name: value("name"), platform: value("platform") as Influencer["platform"], niche: value("niche") || "Belum diisi", rate: Number(value("rate")), followers: value("followers") || "—", engagement: "—", status: "Review" }; return { ...current, influencers: [...current.influencers, item] }; }
  if (type === "influencerSchedule") { const item: InfluencerSchedule = { id: globalThis.crypto.randomUUID(), influencer: value("influencer"), platform: value("platform") as InfluencerSchedule["platform"], campaign: value("campaign"), content: value("content"), date: value("date"), time: value("time"), status: value("status"), rate: Number(value("rate")), spent: Number(value("spent")), paymentStatus: value("paymentStatus"), notes: value("notes") || undefined }; return { ...current, influencerSchedules: [item, ...current.influencerSchedules] }; }
  if (type === "transaction") { const item: Transaction = { id: globalThis.crypto.randomUUID(), vendor: value("vendor"), category: value("category"), amount: Number(value("amount")), type: value("transactionType"), brand: value("brand"), date: new Date().toISOString().slice(0, 10), status: "Belum Dibayar" }; return { ...current, transactions: [item, ...current.transactions] }; }
  if (type === "user") { const user: User = { name: value("name"), username: value("username"), email: value("email"), whatsapp: value("whatsapp"), role: value("role"), status: "Aktif" }; return { ...current, users: [...current.users, user] }; }
  if (type === "metrics") { const platform = value("platform").toLowerCase() as "instagram" | "facebook" | "threads" | "tiktok"; const snapshot = { platform, date: "10 Okt", followers: Number(value("followers")), reach: Number(value("reach")), impressions: Number(value("impressions")), engagementRate: Number(value("engagement")), views: Number(value("views")) }; return { ...current, socialSnapshots: [...current.socialSnapshots.filter((item) => !(item.platform === platform && item.date === "10 Okt")), snapshot], socialAccounts: current.socialAccounts.map((account) => account.platform === platform ? { ...account, followers: snapshot.followers, lastSync: "Input manual · baru saja" } : account) }; }
  return current;
}
