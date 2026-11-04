"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { AdminDashboardNote, AppData, CampaignDiscussionNote, CampaignExpense, CampaignExpenseInput, CampaignInfluencerBookingPatch, CampaignInfluencerTheme, CampaignInfluencerThemeInput, CampaignKpiInput, CampaignTimelinePhase, ContentItem, EntityId, Influencer, InfluencerPaymentStatus, InfluencerProfileInput, InfluencerSchedule, NotificationItem, Task, TaskDraft, TaskPatch, Transaction, User, UserIdentity, ViewName } from "@/lib/types";
import { allowedTaskStatuses, applyStatusRequest, filteredBoardTasks, isTaskManager } from "@/lib/task-workflow";
import { createTaskRecord, decideTaskStatus as persistStatusDecision, loadTaskBoard, requestTaskStatus } from "@/lib/supabase/task-board-data";
import { datedPhase, orderedPhases, validateTimeline } from "@/lib/campaign-timeline";
import { TaskDialog } from "./task-dialog";
import { applyTaskPatch, validateTaskPatch, validateKpi } from "@/lib/campaign-overview";
import { persistTaskPatch, persistCampaignKpi } from "@/lib/supabase/campaign-overview-data";
import { canCreateCampaignExpense, validateCampaignExpense } from "@/lib/campaign-finance";
import { persistCampaignExpense } from "@/lib/supabase/campaign-finance-data";
import { calculateInfluencerPaidAmount, canEditCampaignInfluencers, influencerPaymentStatuses, isInfluencerBookingStatus, nextCampaignInfluencerThemeCode, validateInfluencerContentLink, validateInfluencerScheduleDates } from "@/lib/campaign-influencer";
import { persistCampaignInfluencerTheme, persistCampaignInfluencerThemeDelete, persistCampaignInfluencerBooking, persistCampaignInfluencerBookingDelete, persistCampaignInfluencerPayment, persistInfluencerProfile } from "@/lib/supabase/campaign-influencer-data";
import { influencerProfileError, influencerProfileLegacyFields, normalizeInfluencerUsername, normalizeWhatsAppNumber } from "@/lib/influencer-profiles";
import { demoData } from "@/lib/demo-data";
import { demoLoginAllowed, emptyWorkspaceData } from "@/lib/production-policy";
import { campaignVersionError, emptyCampaignContent, storedCampaign } from "@/lib/campaign-persistence";
import { CampaignConflict, persistCampaignRecord } from "@/lib/supabase/campaign-record-data";
import type { Campaign, CampaignSavePatch, SaveCampaign } from "@/lib/types";
import { loadLocalData, resetLocalData, saveLocalData } from "@/lib/storage";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { loadWorkspaceData, saveWorkspaceData } from "@/lib/supabase/workspace-data";
import { authEmailFromUsername, isValidPin, normalizeUsername } from "@/lib/auth-identity";
import { createBasicCampaign, validateCampaignPeriod } from "@/lib/campaign-form";
import { demoAccountCredentials, demoAccounts } from "@/lib/demo-account";
import { AccountView, AnalyticsView, BrandView, CalendarView, CampaignsView, DashboardView, InfluencersView, PartnersView, RequestsView, TodoView } from "./views";
import { SocialHubView } from "./social-hub";
import { Avatar, Icon } from "./ui";
import { BrandLogo } from "./brand-logo";
import { UserManagementView } from "./user-management";
import { authenticateLocalUser, setLocalPin } from "@/lib/local-users";
import { canManageUsers, roleForJobTitle, validateManagedUser, type ManagedUserInput } from "@/lib/user-management";
import { userAvatarExtension, validateUserAvatar } from "@/lib/user-avatar";
import { deriveNotifications, loadLocalNotifications, saveLocalNotifications, unreadNotifications } from "@/lib/notifications";
import { NotificationPanel } from "./notifications";
import { AdminNotesView } from "./admin-notes";
import { DevelopmentPaywallDialog } from "./development-paywall-dialog";
import { deleteAdminDashboardNote as persistAdminNoteDelete, persistAdminDashboardNote, persistCampaignMembers, persistCampaignNote, persistCampaignNotePin } from "@/lib/supabase/campaign-dashboard-data";
import { isDevelopmentMenuLocked } from "@/lib/development-menus";


const operationalSnapshot = (value: AppData) => JSON.stringify([value.brands, value.content, value.requests, value.influencers, value.transactions, value.socialInbox]);

const navigation: Array<{ group?: string; view: ViewName; label: string; icon: string; count?: string }> = [
  { group: "WORKSPACE", view: "dashboard", label: "Dashboard", icon: "home" },
  { view: "campaigns", label: "Campaign", icon: "campaign", count: "4" },
  { view: "brands", label: "Brand", icon: "book" },
  { view: "todo", label: "To-Do", icon: "check-square", count: "12" },
  { group: "OPERASIONAL", view: "calendar", label: "Kalender Konten", icon: "calendar" },
  { view: "influencers", label: "Data Influencer", icon: "users" },
  { view: "requests", label: "Request & Ide", icon: "sparkles", count: "3" },
  { view: "partners", label: "Mitra & Keuangan", icon: "handshake" },
  { view: "analytics", label: "Analitik Sosmed", icon: "chart" },
  { view: "social-hub", label: "Social Hub", icon: "instagram" },
  { group: "AKUN", view: "account", label: "Akun & Keamanan", icon: "users" },
  { view: "users", label: "Manajemen User", icon: "users" },
  { group: "ADMINISTRASI", view: "admin-notes", label: "Catatan", icon: "pin" },
];

const titles: Record<ViewName, string> = { dashboard: "Dashboard", campaigns: "Campaign", brands: "Brand", todo: "To-Do", calendar: "Kalender Konten", requests: "Request & Ide", partners: "Mitra & Keuangan", influencers: "Data Influencer", analytics: "Analitik Sosmed", "social-hub": "Social Hub", account: "Akun & Keamanan", users: "Manajemen User", "admin-notes": "Catatan" };

export function AppShell() {
  const [view, setView] = useState<ViewName>("dashboard");
  const [data, setData] = useState<AppData>(emptyWorkspaceData);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<EntityId | null>(null);
  const [newTaskCampaignId, setNewTaskCampaignId] = useState<EntityId | null>(null);
  const [taskBoardError, setTaskBoardError] = useState("");
  const [modal, setModal] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; actionLabel?: string; action?: () => void } | null>(null);
  const [authMode, setAuthMode] = useState<"loading" | "signed-out" | "demo" | "live">("loading");
  const [identity, setIdentity] = useState<UserIdentity>(demoAccounts[0]);
  const [liveContext, setLiveContext] = useState<{ workspaceId: string; userId: string } | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [developmentPaywallOpen, setDevelopmentPaywallOpen] = useState(false);
  const [requestedCampaignId, setRequestedCampaignId] = useState<string | null>(null);
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const hydrated = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;
  const taskMutationVersion = useRef(0);
  const taskQueues = useRef(new Map<string, Promise<void>>());
  const latestTasks = useRef(new Map<string, Task>());
  const sessionGeneration = useRef(0);
  const notificationSnapshot = useRef<AppData | null>(null);
  const autosaveSnapshot = useRef<string | null>(null);
  const liveContextRef = useRef(liveContext); liveContextRef.current = liveContext;
  const authAttempt = useRef(false);
  const campaignWrites = useRef(0);
  const [sessionError, setSessionError] = useState("");
  const currentView: ViewName = isDevelopmentMenuLocked(view, identity) ? "dashboard" : view;
  const clearSession = useCallback(() => {
    sessionGeneration.current++; hydrated.current = false; autosaveSnapshot.current = null;
    latestTasks.current.clear(); taskQueues.current.clear(); notificationSnapshot.current = null;
    liveContextRef.current = null; setLiveContext(null); setData(emptyWorkspaceData()); setNotifications([]);
    setModal(null); setDevelopmentPaywallOpen(false); setEditingTaskId(null); setNotificationOpen(false); setRequestedCampaignId(null);
    setIdentity({ name: "", username: "", email: "", whatsapp: "", role: "Viewer", accessRole: "viewer" });
    setAuthMode("signed-out");
  }, []);

  const connectLiveWorkspace = useCallback(async (accessToken: string, userId: string, email: string) => {
    if (!supabase) throw new Error("Koneksi Supabase belum tersedia.");
    const generation = ++sessionGeneration.current;
    if (liveContextRef.current?.userId !== userId) {
      setAuthMode("loading"); setData(emptyWorkspaceData()); setNotifications([]); setModal(null);
      setEditingTaskId(null); setRequestedCampaignId(null); setNotificationOpen(false); setDevelopmentPaywallOpen(false); setView("dashboard");
    }
    const response = await fetch("/api/bootstrap", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const result = await response.json() as { workspaceId?: string; profile?: UserIdentity; error?: string };
    if (!response.ok || !result.workspaceId) throw new Error(result.error || "Workspace gagal disiapkan.");

    latestTasks.current.clear();
    const profileEmail = result.profile?.email || email;
    const liveData = await loadWorkspaceData(supabase, result.workspaceId, emptyWorkspaceData(), profileEmail);
    if (generation !== sessionGeneration.current) return;
    notificationSnapshot.current = null;
    autosaveSnapshot.current = operationalSnapshot(liveData);
    setSessionError("");
    setNotifications(liveData.notifications ?? []);
    setIdentity({
      id: userId,
      name: result.profile?.name || profileEmail.split("@")[0],
      username: result.profile?.username || "",
      email: profileEmail,
      whatsapp: result.profile?.whatsapp || "",
      role: result.profile?.role || "member",
      accessRole: result.profile?.accessRole || "member",
      avatarUrl: result.profile?.avatarUrl,
    });
    setData(liveData);
    liveContextRef.current = { workspaceId: result.workspaceId, userId };
    setLiveContext(liveContextRef.current);
    hydrated.current = true;
    setAuthMode("live");
  }, [supabase]);

  useEffect(() => {
    setTheme(window.localStorage.getItem("ngapaya-theme") === "dark" ? "dark" : "light");
    setCollapsed(window.localStorage.getItem("ngapaya-sidebar-collapsed") === "true");

    if (!supabase) {
      const localData = demoLoginAllowed() ? loadLocalData() : emptyWorkspaceData();
      notificationSnapshot.current = null;
      setData(localData);
      setNotifications(loadLocalNotifications());
      hydrated.current = true;
      setAuthMode("signed-out");
      return;
    }

    let active = true;
    void (async () => {
      const generation = sessionGeneration.current;
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: userData } = await supabase.auth.getUser();
      if (!active || generation !== sessionGeneration.current) return;
      if (!sessionData.session || !userData.user) {
        setAuthMode("signed-out");
        return;
      }
      try {
        await connectLiveWorkspace(sessionData.session.access_token, userData.user.id, userData.user.email || "");
      } catch (error) {
        setSessionError(error instanceof Error ? error.message : "Supabase gagal dimuat.");
        setAuthMode("signed-out");
      }
    })();

    const verifySession = async () => {
      if (!active || authAttempt.current) return;
      const generation = sessionGeneration.current;
      const { data: verified, error } = await supabase.auth.getUser();
      if (!active || generation !== sessionGeneration.current) return;
      if (!verified.user) {
        if (!error || error.status === 401 || error.status === 403 || error.name === "AuthSessionMissingError") clearSession();
        else setSessionError("Koneksi sesi belum dapat diperiksa. Periksa internet dan coba lagi.");
        return;
      }
      const { data: refreshed } = await supabase.auth.getSession();
      if (!refreshed.session || !active || generation !== sessionGeneration.current) return;
      if (liveContextRef.current?.userId !== verified.user.id) {
        try { await connectLiveWorkspace(refreshed.session.access_token, verified.user.id, verified.user.email || ""); }
        catch (failure) { setSessionError((failure as Error).message); clearSession(); }
      } else {
        const response = await fetch("/api/bootstrap", { method: "POST", headers: { Authorization: `Bearer ${refreshed.session.access_token}` } });
        const result = await response.json();
        if (!active || generation !== sessionGeneration.current) return;
        if (!response.ok) {
          setSessionError(result.error || "Sesi atau koneksi database gagal diperiksa.");
          if (response.status === 401 || response.status === 403) clearSession();
        } else { setSessionError(""); if (result.profile) setIdentity(result.profile); }
      }
    };
    const focused = () => { void verifySession().catch(() => setSessionError("Koneksi terputus. Muat ulang untuk mencoba kembali.")); };
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") clearSession();
      else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") window.setTimeout(focused, 0);
    });
    window.addEventListener("focus", focused); window.addEventListener("online", focused);
    return () => { active = false; listener.subscription.unsubscribe(); window.removeEventListener("focus", focused); window.removeEventListener("online", focused); };
  }, [connectLiveWorkspace, supabase, clearSession]);

  useEffect(() => {
    if (!hydrated.current) return;
    if (authMode === "demo") saveLocalData(data);
    if (authMode !== "live" || !liveContext || !supabase || !isTaskManager(identity)) return;

    const snapshot = operationalSnapshot(data);
    if (autosaveSnapshot.current === snapshot) return;
    if (autosaveSnapshot.current === null) { autosaveSnapshot.current = snapshot; return; }
    const timer = window.setTimeout(() => {
      void saveWorkspaceData(supabase, liveContext.workspaceId, liveContext.userId, data, canManageUsers(identity))
        .then(() => { autosaveSnapshot.current = snapshot; })
        .catch((error) => {
          setToast({ message: error instanceof Error ? `Gagal menyimpan: ${error.message}` : "Gagal menyimpan ke Supabase." });
        });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [authMode, data, liveContext, supabase, identity.accessRole]);

  useEffect(() => {
    if (!hydrated.current || authMode === "loading" || authMode === "signed-out") return;
    if (!notificationSnapshot.current) {
      notificationSnapshot.current = structuredClone(data);
      return;
    }
    if (authMode === "demo") {
      const generated = deriveNotifications(notificationSnapshot.current, data, identity);
      if (generated.length) setNotifications((current) => [...generated, ...current].slice(0, 100));
    }
    notificationSnapshot.current = structuredClone(data);
  }, [authMode, data, identity]);

  useEffect(() => {
    if (authMode === "demo") saveLocalNotifications(notifications);
  }, [authMode, notifications]);

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
      if (!supabase) { clearSession(); return; }
      // Keep the login form hidden until Supabase has removed the session cookies.
      // Otherwise an immediate reload/API call can restore the supposedly signed-out user.
      if (authAttempt.current) return;
      authAttempt.current = true;
      sessionGeneration.current++;
      setAuthMode("loading");
      void (async () => {
        try {
          const { error } = await supabase.auth.signOut({ scope: "local" });
          if (error) throw error;
          setSessionError("");
          clearSession();
        } catch {
          setSessionError("Logout belum selesai. Periksa koneksi dan coba lagi.");
          setAuthMode("live");
        } finally { authAttempt.current = false; }
      })();
      return;
    }
    setToast({ message });
    window.setTimeout(() => setToast(null), 3200);
  };
  const notifyAction = (message: string, actionLabel: string, action: () => void) => {
    setToast({ message, actionLabel, action });
    window.setTimeout(() => setToast(null), 6000);
  };
  const refreshNotifications = useCallback(async () => {
    if (authMode !== "live" || !supabase || !liveContext) return;
    const generation = sessionGeneration.current;
    const result = await supabase.from("notifications").select("id, kind, title, body, created_at, read_at, task_id, campaign_id").eq("workspace_id", liveContext.workspaceId).order("created_at", { ascending: false }).limit(100);
    if (result.error || generation !== sessionGeneration.current) return;
    setNotifications((result.data ?? []).map((notification) => ({ id: notification.id, kind: notification.kind as NotificationItem["kind"], title: notification.title, body: notification.body, createdAt: notification.created_at, readAt: notification.read_at, taskId: notification.task_id, campaignId: notification.campaign_id, target: notification.kind === "campaign_changed" ? "campaigns" : "todo" })));
  }, [authMode, liveContext, supabase]);
  useEffect(() => {
    if (authMode !== "live") return;
    const timer = window.setInterval(() => { void refreshNotifications(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [authMode, refreshNotifications]);
  const markNotificationRead = async (notification: NotificationItem) => {
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: item.readAt || new Date().toISOString() } : item));
    setNotificationOpen(false);
    if (authMode === "live" && supabase) await supabase.rpc("mark_notification_read", { p_notification_id: notification.id });
    navigate(notification.target);
  };
  const markAllNotificationsRead = async () => {
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || readAt })));
    if (authMode === "live" && supabase && liveContext) await supabase.rpc("mark_all_notifications_read", { p_workspace_id: liveContext.workspaceId });
  };
  const navigate = (target: string) => {
    if (isDevelopmentMenuLocked(target, identity)) {
      setDevelopmentPaywallOpen(true);
      setSidebarOpen(false);
      return;
    }
    if (["users", "admin-notes"].includes(target) && !canManageUsers(identity)) return notify("Menu ini hanya tersedia untuk Super Admin.");
    setView(target as ViewName);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  useEffect(() => {
    if (!isDevelopmentMenuLocked(view, identity)) return;
    setView("dashboard");
    setDevelopmentPaywallOpen(false);
  }, [view, identity.accessRole]);
  const openResetPin = (user: User) => { if (!canManageUsers(identity)) return; setResetUser(user); setModal("resetPin"); };
  const closeModal = () => { setModal(null); setResetUser(null); };
  const resetPin = async (username: string, pin: string) => {
    if (!canManageUsers(identity)) throw new Error("Hanya Super Admin dapat mereset PIN user.");
    if (!dataRef.current.users.some((user) => user.username === username)) throw new Error("User tidak ditemukan di workspace ini.");
    if (!isValidPin(pin)) throw new Error("PIN harus terdiri dari 6 angka.");
    if (authMode === "demo") { await setLocalPin(username, pin); notify("PIN user berhasil direset."); return; }
    if (!supabase || !liveContext) throw new Error("Koneksi workspace belum tersedia.");
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("Sesi login tidak ditemukan.");
    const response = await fetch("/api/auth/reset-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ workspaceId: liveContext.workspaceId, username, pin }),
    });
    const result = await response.json() as { error?: string; message?: string };
    if (!response.ok) throw new Error(result.error || "PIN gagal direset.");
  };
  const createUser = async (input: { name: string; username: string; email: string; whatsapp: string; role: string; pin: string; accessRole?: ManagedUserInput["accessRole"] }) => {
    const generation = sessionGeneration.current;
    if (!canManageUsers(identity)) throw new Error("Hanya Super Admin dapat membuat user.");
    const profile = { ...input, username: normalizeUsername(input.username), accessRole: input.accessRole || roleForJobTitle(input.role) };
    const validation = validateManagedUser(profile, true);
    if (validation) throw new Error(validation);
    if (dataRef.current.users.some((user) => normalizeUsername(user.username) === profile.username)) throw new Error("Username sudah digunakan.");
    if (authMode === "demo") {
      await setLocalPin(profile.username, input.pin);
      if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah. Coba kembali.");
      const { pin: _pin, ...safeProfile } = profile;
      const user: User = { ...safeProfile, id: globalThis.crypto.randomUUID(), status: "Aktif" };
      const next = { ...dataRef.current, users: [...dataRef.current.users, user] };
      saveLocalData(next); setData(next);
      return;
    }
    if (!supabase || !liveContext) throw new Error("Koneksi workspace belum tersedia.");
    const token = await getAccessToken();
    if (!token) throw new Error("Sesi login tidak ditemukan.");
    const response = await fetch("/api/auth/create-user", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ workspaceId: liveContext.workspaceId, fullName: profile.name, username: profile.username, email: profile.email, whatsapp: profile.whatsapp, jobTitle: profile.role, accessRole: profile.accessRole, pin: input.pin }) });
    const result = await response.json() as { user?: User; error?: string };
    if (!response.ok || !result.user) throw new Error(result.error || "Anggota gagal dibuat.");
    if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah. Coba kembali.");
    setData((current) => ({ ...current, users: [...current.users, result.user as User] }));
  };
  const saveManagedUser = async (input: ManagedUserInput, id?: EntityId) => {
    const generation = sessionGeneration.current;
    if (!canManageUsers(identity)) throw new Error("Hanya Super Admin dapat mengelola user.");
    if (id == null) { await createUser({ ...input, pin: input.pin || "" }); notify("User berhasil dibuat."); return; }
    const validation = validateManagedUser(input);
    if (validation) throw new Error(validation);
    const user = dataRef.current.users.find((item) => String(item.id || item.username) === String(id));
    if (!user) throw new Error("User tidak ditemukan di workspace ini.");
    if (input.username !== user.username) throw new Error("Username akun tidak dapat diubah.");
    if (user.username === identity.username && input.accessRole !== "owner") throw new Error("Level akses akun Anda sendiri tetap Super Admin.");
    const { pin: _pin, ...profile } = input;
    let saved: User = { ...user, ...profile };
    if (authMode === "live" && supabase && liveContext) {
      const token = await getAccessToken();
      if (!token) throw new Error("Sesi login tidak ditemukan.");
      const response = await fetch(`/api/auth/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...profile, workspaceId: liveContext.workspaceId }) });
      const result = await response.json() as { user?: User; error?: string };
      if (!response.ok || !result.user) throw new Error(result.error || "User gagal diperbarui.");
      saved = result.user;
    }
    if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah. Coba kembali.");
    const next = { ...dataRef.current, users: dataRef.current.users.map((item) => String(item.id || item.username) === String(id) ? saved : item) };
    if (authMode === "demo") saveLocalData(next);
    setData(next);
    if (user.username === identity.username) setIdentity((current) => ({ ...current, ...profile }));
    notify("Profil dan level akses user berhasil disimpan.");
  };
  const changePin = async (pin: string) => {
    if (authMode === "demo") { await setLocalPin(identity.username, pin); return; }
    if (!supabase) throw new Error("Ganti PIN hanya tersedia saat Supabase aktif.");
    if (!isValidPin(pin)) throw new Error("PIN harus terdiri dari 6 angka.");
    const { error } = await supabase.auth.updateUser({ password: pin });
    if (error) throw error;
  };
  const getAccessToken = useCallback(async () => {
    if (!supabase) return null;
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData.session?.access_token || null;
  }, [supabase]);
  const uploadUserAvatar = async (file: File, userId: EntityId) => {
    const generation = sessionGeneration.current;
    if (!canManageUsers(identity)) throw new Error("Hanya Super Admin dapat mengubah foto profil.");
    if (!dataRef.current.users.some((user) => String(user.id || user.username) === String(userId))) throw new Error("User tidak ditemukan.");
    const validation = validateUserAvatar(file);
    if (validation) throw new Error(validation);
    if (!userAvatarExtension(new Uint8Array(await file.slice(0, 12).arrayBuffer()), file.type)) throw new Error("Isi file tidak sesuai format foto.");
    let url: string;
    if (authMode === "demo") {
      url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Foto gagal dibaca.")); reader.readAsDataURL(file);
      });
    } else {
      if (!liveContext) throw new Error("Workspace belum tersedia.");
      const token = await getAccessToken();
      if (!token) throw new Error("Sesi login tidak ditemukan.");
      const form = new FormData(); form.set("workspaceId", liveContext.workspaceId); form.set("file", file);
      const response = await fetch(`/api/auth/users/${userId}/avatar`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Foto gagal diunggah.");
      url = result.url;
    }
    if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah. Coba kembali.");
    return url;
  };
  const uploadOwnAvatar = async (file: File) => {
    const generation = sessionGeneration.current;
    const userId = identity.id ?? identity.username;
    const validation = validateUserAvatar(file);
    if (validation) throw new Error(validation);
    if (!userAvatarExtension(new Uint8Array(await file.slice(0, 12).arrayBuffer()), file.type)) throw new Error("Isi file tidak sesuai format foto.");

    let url: string;
    if (authMode === "demo") {
      url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Foto gagal dibaca."));
        reader.readAsDataURL(file);
      });
    } else {
      if (!liveContext || String(liveContext.userId) !== String(identity.id)) throw new Error("Sesi akun tidak cocok dengan workspace aktif.");
      const token = await getAccessToken();
      if (!token) throw new Error("Sesi login tidak ditemukan.");
      const form = new FormData();
      form.set("workspaceId", liveContext.workspaceId);
      form.set("file", file);
      const response = await fetch("/api/auth/profile/avatar", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Foto gagal diunggah.");
      url = result.url;
    }

    if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah. Coba kembali.");
    const next = { ...dataRef.current, users: dataRef.current.users.map((user) => String(user.id || user.username) === String(userId) ? { ...user, avatarUrl: url } : user) };
    if (authMode === "demo") saveLocalData(next);
    setData(next);
    setIdentity((current) => current.username === identity.username ? { ...current, avatarUrl: url } : current);
    return url;
  };
  const refreshData = useCallback(async () => {
    if (!supabase || !liveContext) return;
    const generation = sessionGeneration.current;
    const liveData = await loadWorkspaceData(supabase, liveContext.workspaceId, emptyWorkspaceData(), identity.email);
    if (generation === sessionGeneration.current) setData(liveData);
  }, [identity.email, liveContext, supabase]);
  const uploadMedia = useCallback(async (file: File, bucket = "social-media", prefix = liveContext?.workspaceId) => {
    if (!supabase || !liveContext) throw new Error("Upload media hanya tersedia saat Supabase aktif.");
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
    const path = `${prefix || liveContext.workspaceId}/${globalThis.crypto.randomUUID()}-${safeName}`;
    const upload = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (upload.error) throw upload.error;
    const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
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
  const enqueueTaskWrite = (taskId: EntityId, run: () => Promise<void>) => {
    const key = String(taskId);
    const queued = (taskQueues.current.get(key) || Promise.resolve()).catch(() => {}).then(run);
    taskMutationVersion.current++;
    taskQueues.current.set(key, queued);
    void queued.finally(() => { taskMutationVersion.current++; if (taskQueues.current.get(key) === queued) taskQueues.current.delete(key); }).catch(() => {});
    return queued;
  };
  const mutateTask = (taskId: EntityId, patch: TaskPatch): Promise<void> => {
    const generation = sessionGeneration.current;
    return enqueueTaskWrite(taskId, async () => {
      if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah. Coba kembali.");
      const current = dataRef.current;
      const task = latestTasks.current.get(String(taskId)) || current.tasks.find((item) => String(item.id) === String(taskId));
      if (!task) throw new Error("Tugas tidak ditemukan.");
      const campaign = current.campaigns.find((item) => String(item.id) === String(task.campaign));
      if (identity.accessRole === "viewer" || (campaign && campaign.lifecycleStatus !== "active")) throw new Error("Tugas hanya dapat dibaca.");
      if (!isTaskManager(identity)) {
        if (Object.keys(patch).some((key) => key !== "status") || !patch.status || !allowedTaskStatuses(task, current.users, identity).includes(patch.status)) throw new Error("Anda hanya dapat mengajukan status berikutnya untuk tugas Anda sendiri.");
        const request = authMode === "live" && supabase ? await requestTaskStatus(supabase, taskId, patch.status, current.users) : { id: globalThis.crypto.randomUUID(), fromStatus: task.status, toStatus: patch.status, requestedBy: identity.id ?? identity.username, requestedByName: identity.name, createdAt: new Date().toISOString() };
        if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah.");
        latestTasks.current.set(String(taskId), { ...task, pendingStatusRequest: request });
        setData((state) => applyStatusRequest(state, taskId, request));
        return;
      }
      const error = validateTaskPatch(patch); if (error) throw new Error(error);
      const eventId = globalThis.crypto.randomUUID(), createdAt = new Date().toISOString();
      if (authMode === "live" && supabase && liveContext) await persistTaskPatch(supabase, liveContext.workspaceId, liveContext.userId, task, patch);
      if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah.");
      const preview = applyTaskPatch({ ...current, tasks: current.tasks.map((item) => String(item.id) === String(taskId) ? task : item) }, taskId, patch, identity, eventId, createdAt);
      latestTasks.current.set(String(taskId), preview.tasks.find((item) => String(item.id) === String(taskId))!);
      setData((state) => { const next = applyTaskPatch(state, taskId, patch, identity, eventId, createdAt); return authMode === "live" ? { ...next, taskStatusHistory: state.taskStatusHistory } : next; });
    });
  };
  const decideTaskStatus = (taskId: EntityId, approve: boolean) => {
    const generation = sessionGeneration.current;
    return enqueueTaskWrite(taskId, async () => {
      if (!isTaskManager(identity)) throw new Error("Hanya Super Admin dapat menyetujui status tugas.");
      const current = dataRef.current;
      const task = latestTasks.current.get(String(taskId)) || current.tasks.find((item) => String(item.id) === String(taskId));
      const request = task?.pendingStatusRequest;
      if (!task || !request) throw new Error("Permintaan status tidak ditemukan.");
      const campaign = current.campaigns.find((item) => String(item.id) === String(task.campaign));
      if (campaign && campaign.lifecycleStatus !== "active") throw new Error("Campaign hanya dapat dibaca.");
      const decision = authMode === "live" && supabase ? await persistStatusDecision(supabase, request.id, approve) : approve && task.status === request.fromStatus ? "approved" : "rejected";
      if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah.");
      const eventId = globalThis.crypto.randomUUID(), createdAt = new Date().toISOString();
      if (decision === "approved") {
        latestTasks.current.set(String(taskId), { ...task, status: request.toStatus, pendingStatusRequest: null });
        setData((state) => { const next = applyTaskPatch(state, taskId, { status: request.toStatus }, identity, eventId, createdAt); return authMode === "live" ? { ...next, taskStatusHistory: state.taskStatusHistory } : next; });
      } else {
        latestTasks.current.set(String(taskId), { ...task, pendingStatusRequest: null });
        setData((state) => ({ ...state, tasks: state.tasks.map((item) => String(item.id) === String(taskId) ? { ...item, pendingStatusRequest: null } : item) }));
      }
      notify(decision === "approved" ? "Perubahan status disetujui." : decision === "rejected" ? "Pengajuan status ditolak." : "Permintaan sudah tidak berlaku. Muat ulang data tugas.");
    });
  };
  const saveTask = async (draft: TaskDraft, id?: EntityId) => {
    if (!isTaskManager(identity)) throw new Error("Hanya Super Admin dapat menambah atau mengedit tugas.");
    const current = dataRef.current;
    const validation = validateTaskPatch(draft); if (validation) throw new Error(validation);
    const brand = current.brands.find((item) => item.name === draft.brand);
    if (!brand) throw new Error("Pilih brand yang terdaftar.");
    const campaign = draft.campaign == null ? null : current.campaigns.find((item) => String(item.id) === String(draft.campaign));
    if (draft.campaign != null && (!campaign || campaign.brand !== brand.name || campaign.lifecycleStatus !== "active")) throw new Error("Pilih campaign aktif yang sesuai dengan brand.");
    if (id != null) { await mutateTask(id, { ...draft, brandId: brand.id, due: draft.dueDate }); notify("Pekerjaan berhasil diperbarui."); return; }
    const generation = sessionGeneration.current;
    const taskId = globalThis.crypto.randomUUID(); taskMutationVersion.current++;
    try {
      if (authMode === "live" && supabase && liveContext) await createTaskRecord(supabase, liveContext.workspaceId, taskId, draft, brand.id);
      if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah.");
      const task: Task = { ...draft, id: taskId, brandId: brand.id, due: draft.dueDate, priority: draft.isPriority ? "Tinggi" : "Rendah", pic: current.users.filter((user) => draft.assigneeIds.some((assigned) => String(assigned) === String(user.id ?? user.username))).map((user) => user.name).join(", ") || "Belum ditentukan", pendingStatusRequest: null };
      latestTasks.current.set(taskId, task);
      setData((state) => applyTaskPatch({ ...state, tasks: [...state.tasks, task] }, taskId, draft, identity, globalThis.crypto.randomUUID(), new Date().toISOString()));
      notify("Tugas berhasil ditambahkan.");
    } finally { taskMutationVersion.current++; }
  };
  const openTaskEditor = (id?: EntityId, campaignId?: EntityId) => {
    if (!isTaskManager(identity)) return notify("Hanya Super Admin dapat menambah atau mengedit tugas.");
    setEditingTaskId(id ?? null); setNewTaskCampaignId(campaignId ?? null); setModal("task");
  };
  const openModal = (type: string) => {
    if (type === "profile") return notify("Profil dikelola oleh Super Admin melalui Manajemen User.");
    if (["user", "resetPin"].includes(type) && !canManageUsers(identity)) return notify("Hanya Super Admin dapat mengelola user.");
    if (type === "campaign" && !isTaskManager(identity)) return notify("Hanya Super Admin dapat membuat Campaign.");
    if (type === "task") openTaskEditor(); else setModal(type);
  };
  const refreshTaskBoard = useCallback(async () => {
    if (authMode !== "live" || !supabase || !liveContext || taskQueues.current.size || campaignWrites.current) return;
    const version = taskMutationVersion.current, generation = sessionGeneration.current;
    try {
      const [tasks, campaigns] = await Promise.all([
        loadTaskBoard(supabase, liveContext.workspaceId, dataRef.current),
        supabase.from("campaigns").select("*,campaign_members(user_id)").eq("workspace_id", liveContext.workspaceId),
      ]);
      if (campaigns.error) throw campaigns.error;
      if (generation !== sessionGeneration.current || version !== taskMutationVersion.current || taskQueues.current.size) return;
      latestTasks.current.clear(); setTaskBoardError("");
      setData((state) => ({ ...state, tasks, campaignMembers: (campaigns.data || []).flatMap((row) => (row.campaign_members || []).map((member: { user_id: string }) => ({ campaignId: row.id, userId: member.user_id }))), campaigns: state.campaigns.map((item) => {
        const row = campaigns.data?.find((candidate) => String(candidate.id) === String(item.id));
        return row && Number(row.row_version) !== item.rowVersion ? storedCampaign(row, item) : item;
      }) }));
    } catch (error) { setTaskBoardError((error as Error).message); }
  }, [authMode, supabase, liveContext]);
  useEffect(() => {
    if (authMode !== "live") return;
    void refreshTaskBoard();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refreshTaskBoard(); }, 15000);
    const focused = () => { void refreshTaskBoard(); }; window.addEventListener("focus", focused);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", focused); };
  }, [authMode, refreshTaskBoard]);

  const saveCampaignKpi = async (campaignId: EntityId, input: CampaignKpiInput, existingId?: string) => {
    if (!["owner", "admin"].includes(identity.accessRole || "")) throw new Error("Hanya Super Admin dapat mengubah KPI.");
    const campaign = dataRef.current.campaigns.find((item) => String(item.id) === String(campaignId));
    if (!campaign || campaign.lifecycleStatus !== "active") throw new Error("Campaign hanya dapat dibaca.");
    const error = validateKpi(input);
    if (error) throw new Error(error);
    const generation = sessionGeneration.current;
    const id = existingId || globalThis.crypto.randomUUID();
    if (authMode === "live" && supabase && liveContext) await persistCampaignKpi(supabase, liveContext.workspaceId, campaignId, input, id);
    if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah. Coba kembali.");
    const kpi = { ...input, id, campaignId, updatedAt: new Date().toISOString() };
    setData((state) => ({ ...state, campaignKpis: [...(state.campaignKpis || []).filter((item) => item.id !== id), kpi] }));
  };

  const createCampaignExpense = async (campaignId: EntityId, input: CampaignExpenseInput) => {
    const campaign = dataRef.current.campaigns.find((item) => String(item.id) === String(campaignId));
    if (!campaign) throw new Error("Campaign tidak ditemukan.");
    if (!canCreateCampaignExpense(identity, campaign)) throw new Error("Hanya Super Admin dan anggota tim yang dapat mencatat pengeluaran pada Campaign aktif.");
    const validationError = validateCampaignExpense(input);
    if (validationError) throw new Error(validationError);
    const generation = sessionGeneration.current;
    const id = globalThis.crypto.randomUUID();
    let saved: CampaignExpense;
    let syncedCampaign: Campaign | undefined;
    if (authMode === "live") {
      if (!supabase || !liveContext) throw new Error("Koneksi workspace belum tersedia.");
      saved = await persistCampaignExpense(supabase, liveContext.workspaceId, campaignId, id, input);
      const { data: row } = await supabase.from("campaigns").select("*").eq("workspace_id", liveContext.workspaceId).eq("id", campaignId).maybeSingle();
      if (row) syncedCampaign = storedCampaign(row, campaign);
    } else {
      saved = { ...input, id, campaignId, title: input.title.trim(), details: input.details?.trim() || null, createdAt: new Date().toISOString(), createdBy: identity.id ?? identity.username };
    }
    if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah. Coba kembali.");
    setData((state) => ({
      ...state,
      campaignExpenses: [saved, ...(state.campaignExpenses || []).filter((item) => String(item.id) !== String(saved.id))],
      campaigns: state.campaigns.map((item) => {
        if (String(item.id) !== String(campaignId)) return item;
        if (!syncedCampaign) return { ...item, spent: Math.max(item.spent, campaign.spent) + saved.amount, rowVersion: (item.rowVersion ?? 1) + 1 };
        return { ...syncedCampaign, spent: Math.max(item.spent, syncedCampaign.spent), rowVersion: Math.max(item.rowVersion ?? 1, syncedCampaign.rowVersion ?? 1) };
      }),
    }));
  };

  const saveCampaign: SaveCampaign = async (campaignId, patch, expectedVersion) => {
    if (!isTaskManager(identity)) throw new Error("Hanya Super Admin dapat menyimpan Campaign.");
    const current = dataRef.current;
    const campaign = current.campaigns.find((item) => String(item.id) === String(campaignId));
    if (!campaign || campaign.lifecycleStatus !== "active") throw new Error("Campaign hanya dapat dibaca.");
    const generation = sessionGeneration.current;
    campaignWrites.current++; taskMutationVersion.current++;
    try {
      let saved: Campaign;
      if (authMode === "live" && supabase && liveContext) saved = await persistCampaignRecord(supabase, liveContext.workspaceId, campaign, patch, expectedVersion);
      else {
        const conflict = campaignVersionError(expectedVersion, campaign.rowVersion ?? 1); if (conflict) throw new Error(conflict);
        const brand = patch.brandId == null ? undefined : current.brands.find((item) => String(item.id) === String(patch.brandId));
        saved = { ...campaign, ...patch, ...(brand ? { brand: brand.name } : {}), rowVersion: (campaign.rowVersion ?? 1) + 1 };
      }
      if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah. Coba kembali.");
      setData((state) => ({ ...state, campaigns: state.campaigns.map((item) => String(item.id) === String(campaignId) ? saved : item), ...(patch.memberIds !== undefined ? { campaignMembers: [...(state.campaignMembers || []).filter((item) => String(item.campaignId) !== String(campaignId)), ...patch.memberIds.map((userId) => ({ campaignId, userId }))] } : {}) }));
    } catch (error) {
      if (error instanceof CampaignConflict && generation === sessionGeneration.current) setData((state) => ({ ...state, campaigns: state.campaigns.map((item) => String(item.id) === String(campaignId) ? error.latest : item), campaignMembers: [...(state.campaignMembers || []).filter((member) => String(member.campaignId) !== String(campaignId)), ...error.memberIds.map((userId) => ({ campaignId, userId }))] }));
      throw error;
    } finally { campaignWrites.current--; taskMutationVersion.current++; }
  };
  const createCampaignRecord = async (campaign: Campaign) => {
    if (!isTaskManager(identity)) throw new Error("Hanya Super Admin dapat membuat Campaign.");
    const brand = dataRef.current.brands.find((item) => item.name === campaign.brand);
    if (!brand) throw new Error("Pilih Brand yang terdaftar.");
    const generation = sessionGeneration.current;
    const saved = authMode === "live" && supabase && liveContext
      ? await persistCampaignRecord(supabase, liveContext.workspaceId, campaign, { name: campaign.name, brandId: brand.id, objective: campaign.objective, startDate: campaign.startDate, endDate: campaign.endDate }, null)
      : { ...campaign, brandId: brand.id, rowVersion: 1, contentConfig: emptyCampaignContent() };
    if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah. Coba kembali.");
    setData((state) => ({ ...state, campaigns: [saved, ...state.campaigns.filter((item) => item.id !== saved.id)] }));
  };

  const saveCampaignMembers = async (campaignId: EntityId, memberIds: EntityId[]) => {
    if (!canManageUsers(identity)) throw new Error("Hanya Super Admin dapat mengatur anggota Campaign.");
    const current = dataRef.current;
    const campaign = current.campaigns.find((item) => String(item.id) === String(campaignId));
    if (!campaign || campaign.lifecycleStatus !== "active") throw new Error("Campaign ini hanya dapat dibaca.");
    const allowed = new Set(current.users.filter((user) => user.status === "Aktif").map((user) => String(user.id ?? user.username)));
    const normalized = [...new Set(memberIds.map(String))];
    if (normalized.some((id) => !allowed.has(id))) throw new Error("Pilih anggota aktif dari workspace ini.");
    if (authMode === "live") {
      if (!supabase) throw new Error("Koneksi workspace belum tersedia.");
      await persistCampaignMembers(supabase, campaignId, normalized);
    }
    setData((state) => ({ ...state, campaignMembers: [...(state.campaignMembers || []).filter((member) => String(member.campaignId) !== String(campaignId)), ...normalized.map((userId) => ({ campaignId, userId }))] }));
  };

  const createCampaignDiscussionNote = async (campaignId: EntityId, body: string, replyTo?: string): Promise<CampaignDiscussionNote> => {
    const current = dataRef.current;
    const campaign = current.campaigns.find((item) => String(item.id) === String(campaignId));
    if (!campaign || campaign.lifecycleStatus !== "active" || identity.accessRole === "viewer") throw new Error("Campaign ini hanya dapat dibaca.");
    if (!body.trim() || body.trim().length > 4000) throw new Error("Catatan wajib diisi dan maksimal 4.000 karakter.");
    if (replyTo && !current.campaignNotes?.some((note) => note.id === replyTo && String(note.campaignId) === String(campaignId))) throw new Error("Catatan yang dibalas tidak ditemukan.");
    const generation = sessionGeneration.current;
    const saved = authMode === "live"
      ? await (async () => { if (!supabase) throw new Error("Koneksi workspace belum tersedia."); return persistCampaignNote(supabase, campaignId, body.trim(), replyTo); })()
      : { id: globalThis.crypto.randomUUID(), campaignId, authorId: identity.id ?? identity.username, authorName: identity.name, body: body.trim(), createdAt: new Date().toISOString(), replyTo: replyTo || null, pinnedToDashboard: false };
    if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah. Coba kembali.");
    setData((state) => ({ ...state, campaignNotes: [saved, ...(state.campaignNotes || [])] }));
    return saved;
  };

  const setCampaignNoteDashboardPin = async (campaignId: EntityId, noteId: string, pinned: boolean) => {
    const current = dataRef.current;
    const campaign = current.campaigns.find((item) => String(item.id) === String(campaignId));
    const note = current.campaignNotes?.find((item) => item.id === noteId && String(item.campaignId) === String(campaignId));
    if (!campaign || campaign.lifecycleStatus !== "active" || identity.accessRole === "viewer" || !note) throw new Error("Catatan atau Campaign tidak dapat diubah.");
    if (String(note.authorId) !== String(identity.id ?? identity.username) && !canManageUsers(identity)) throw new Error("Hanya penulis catatan atau Super Admin yang dapat mengubah pin.");
    if (authMode === "live") {
      if (!supabase) throw new Error("Koneksi workspace belum tersedia.");
      await persistCampaignNotePin(supabase, campaignId, noteId, pinned);
    }
    setData((state) => ({ ...state, campaignNotes: (state.campaignNotes || []).map((item) => item.id === noteId ? { ...item, pinnedToDashboard: pinned } : item) }));
  };

  const saveAdminNote = async (input: Pick<AdminDashboardNote, "title" | "body" | "recipientIds" | "expiresAt">, id?: string) => {
    if (!canManageUsers(identity)) throw new Error("Hanya Super Admin dapat mengelola Catatan.");
    const current = dataRef.current;
    const title = input.title.trim(), body = input.body.trim();
    const recipients = [...new Set(input.recipientIds.map(String))];
    if (!title || title.length > 160 || !body || body.length > 4000 || !recipients.length) throw new Error("Isi judul, isi catatan, dan pilih minimal satu penerima.");
    const activeIds = new Set(current.users.filter((user) => user.status === "Aktif").map((user) => String(user.id ?? user.username)));
    if (recipients.some((recipient) => !activeIds.has(recipient))) throw new Error("Semua penerima harus merupakan user aktif di workspace.");
    if (input.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt)) throw new Error("Tanggal kedaluwarsa tidak valid.");
    const existing = id ? current.adminDashboardNotes?.find((note) => note.id === id) : undefined;
    if (id && !existing) throw new Error("Catatan tidak ditemukan.");
    let saved: AdminDashboardNote;
    if (authMode === "live") {
      if (!supabase || !liveContext) throw new Error("Koneksi workspace belum tersedia.");
      saved = await persistAdminDashboardNote(supabase, liveContext.workspaceId, { title, body, recipientIds: recipients, expiresAt: input.expiresAt || null }, id);
    } else saved = { id: id || globalThis.crypto.randomUUID(), title, body, createdBy: existing?.createdBy ?? identity.id ?? identity.username, createdByName: existing?.createdByName ?? identity.name, recipientIds: recipients, expiresAt: input.expiresAt || null, isActive: true, createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    setData((state) => ({ ...state, adminDashboardNotes: [...(state.adminDashboardNotes || []).filter((note) => note.id !== saved.id), saved] }));
    notify(existing ? "Catatan berhasil diperbarui." : "Catatan berhasil dibuat.");
  };

  const deleteAdminNote = async (id: string) => {
    if (!canManageUsers(identity)) throw new Error("Hanya Super Admin dapat menghapus Catatan.");
    if (!dataRef.current.adminDashboardNotes?.some((note) => note.id === id)) throw new Error("Catatan tidak ditemukan.");
    if (authMode === "live") {
      if (!supabase || !liveContext) throw new Error("Koneksi workspace belum tersedia.");
      await persistAdminNoteDelete(supabase, liveContext.workspaceId, id);
    }
    setData((state) => ({ ...state, adminDashboardNotes: (state.adminDashboardNotes || []).filter((note) => note.id !== id) }));
  };

  const saveCampaignTimeline = async (campaignId: EntityId, phaseMode: boolean, input: CampaignTimelinePhase[], expectedVersion?: number) => {
    if (!isTaskManager(identity)) throw new Error("Hanya Super Admin dapat mengatur fase.");
    const campaign = dataRef.current.campaigns.find((item) => String(item.id) === String(campaignId));
    if (!campaign || (campaign.lifecycleStatus || "active") !== "active") throw new Error("Campaign hanya dapat dibaca.");
    const phases = orderedPhases(input);
    const error = validateTimeline(phases, campaign);
    if (error) throw new Error(error);
    if (phases.some((phase) => !datedPhase(phase) && !campaign.timelineConfig?.phases.some((old) => old.id === phase.id && !old.startDate && !old.endDate))) throw new Error("Tanggal mulai dan selesai fase wajib diisi.");
    const generation = sessionGeneration.current;
    let saved = { ...campaign, rowVersion: (campaign.rowVersion ?? 1) + 1, timelineConfig: { ...campaign.timelineConfig, phaseMode, phases, taskPhase: campaign.timelineConfig?.taskPhase || {} } };
    campaignWrites.current++; taskMutationVersion.current++;
    try {
      if (authMode === "live" && supabase && liveContext) saved = await persistCampaignRecord(supabase, liveContext.workspaceId, campaign, { phases, phase_mode: phaseMode }, expectedVersion ?? campaign.rowVersion ?? 1, true) as typeof saved;
      else { const conflict = campaignVersionError(expectedVersion ?? campaign.rowVersion ?? 1, campaign.rowVersion ?? 1); if (conflict) throw new Error(conflict); }
      if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah. Coba kembali.");
      setData((state) => ({ ...state, campaigns: state.campaigns.map((item) => String(item.id) === String(campaign.id) ? saved : item) }));
    } catch (error) {
      if (error instanceof CampaignConflict && generation === sessionGeneration.current) setData((state) => ({ ...state, campaigns: state.campaigns.map((item) => String(item.id) === String(campaign.id) ? error.latest : item), campaignMembers: [...(state.campaignMembers || []).filter((member) => String(member.campaignId) !== String(campaign.id)), ...error.memberIds.map((userId) => ({ campaignId: campaign.id, userId }))] }));
      throw error;
    } finally { campaignWrites.current--; taskMutationVersion.current++; }
  };

  const saveInfluencerTheme = async (campaignId: EntityId, input: CampaignInfluencerThemeInput, id?: EntityId) => {
    const current = dataRef.current;
    const campaign = current.campaigns.find((item) => String(item.id) === String(campaignId));
    if (!canEditCampaignInfluencers(identity, campaign)) throw new Error("Akun tidak dapat mengedit influencer pada Campaign ini.");
    if (!input.name.trim()) throw new Error("Nama tema wajib diisi.");
    const existing = id == null ? undefined : current.influencerThemes.find((item) => String(item.id) === String(id) && String(item.campaignId) === String(campaignId));
    if (id != null && !existing) throw new Error("Tema tidak ditemukan pada Campaign ini.");
    const generation = sessionGeneration.current;
    let saved: CampaignInfluencerTheme = { ...input, name: input.name.trim(), id: existing?.id ?? globalThis.crypto.randomUUID(), campaignId, code: existing?.code ?? nextCampaignInfluencerThemeCode(current.influencerThemes, campaignId) };
    if (authMode === "live") {
      if (!supabase || !liveContext) throw new Error("Koneksi workspace belum tersedia.");
      saved = await persistCampaignInfluencerTheme(supabase, campaignId, input, id);
    }
    if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah. Coba kembali.");
    setData((state) => ({ ...state, influencerThemes: existing ? state.influencerThemes.map((item) => String(item.id) === String(saved.id) ? saved : item) : [...state.influencerThemes.filter((item) => String(item.id) !== String(saved.id)), saved], influencerSchedules: state.influencerSchedules.map((item) => String(item.themeId) === String(saved.id) ? { ...item, themeName: saved.name, content: saved.name } : item) }));
    return saved;
  };
  const deleteInfluencerTheme = async (campaignId: EntityId, id: EntityId) => {
    const current = dataRef.current;
    const campaign = current.campaigns.find((item) => String(item.id) === String(campaignId));
    if (!campaign || !isTaskManager(identity) || !canEditCampaignInfluencers(identity, campaign)) throw new Error("Hanya Super Admin yang dapat menghapus tema pada Campaign aktif.");
    const existing = current.influencerThemes.find((item) => String(item.id) === String(id) && String(item.campaignId) === String(campaignId));
    if (!existing) throw new Error("Tema tidak ditemukan pada Campaign ini.");
    const generation = sessionGeneration.current;
    if (authMode === "live") {
      if (!supabase || !liveContext) throw new Error("Koneksi workspace belum tersedia.");
      await persistCampaignInfluencerThemeDelete(supabase, campaignId, id);
    }
    if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah. Coba kembali.");
    setData((state) => ({ ...state, influencerThemes: state.influencerThemes.filter((item) => String(item.id) !== String(id)), influencerSchedules: state.influencerSchedules.map((item) => String(item.themeId) === String(id) ? { ...item, themeId: null } : item) }));
  };
  const saveInfluencerProfile = async (input: InfluencerProfileInput, id?: EntityId) => {
    if (!identity || identity.accessRole === "viewer") throw new Error("Akun baca saja tidak dapat mengubah Data Influencer.");
    const validation = influencerProfileError(input);
    if (validation) throw new Error(validation);
    const existing = id == null ? undefined : dataRef.current.influencers.find((item) => String(item.id) === String(id));
    if (id != null && !existing) throw new Error("Profil influencer tidak ditemukan.");
    const generation = sessionGeneration.current;
    const legacy = influencerProfileLegacyFields(input);
    let saved: Influencer;
    if (authMode === "live") {
      if (!supabase || !liveContext) throw new Error("Koneksi workspace belum tersedia.");
      saved = await persistInfluencerProfile(supabase, liveContext.workspaceId, input, id);
    } else {
      const nextId = id ?? globalThis.crypto.randomUUID();
      saved = {
        ...(existing || { engagement: "—", status: "Aktif" }),
        id: nextId,
        name: input.name.trim(),
        whatsapp: normalizeWhatsAppNumber(input.whatsapp),
        platform: legacy.platform as Influencer["platform"],
        niche: legacy.niche,
        rate: legacy.rate,
        followers: legacy.followers,
        collaborationType: input.collaborationType,
        niches: [...input.niches],
        customNiche: input.customNiche.trim(),
        accounts: input.accounts.map((account) => ({ ...account, id: account.id || globalThis.crypto.randomUUID(), username: normalizeInfluencerUsername(account.username || "") })),
        rateCards: input.rateCards.map((card) => ({ ...card, id: card.id || globalThis.crypto.randomUUID() })),
      };
    }
    if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah. Coba kembali.");
    setData((state) => ({ ...state, influencers: existing
      ? state.influencers.map((item) => String(item.id) === String(saved.id) ? saved : item)
      : [saved, ...state.influencers.filter((item) => String(item.id) !== String(saved.id))] }));
    return saved;
  };
  const saveInfluencerBooking = async (campaignId: EntityId, input: CampaignInfluencerBookingPatch, id?: EntityId) => {
    const current = dataRef.current;
    const campaign = current.campaigns.find((item) => String(item.id) === String(campaignId));
    if (!campaign || !canEditCampaignInfluencers(identity, campaign)) throw new Error("Akun tidak dapat mengedit influencer pada Campaign ini.");
    if (Object.keys(input).some((key) => !["influencerId", "accountId", "rateCardId", "agreedRate", "themeId", "visitDate", "uploadDate", "notes", "status", "contentLink"].includes(key))) throw new Error("Field jadwal tidak valid.");
    if (input.status !== undefined && !isInfluencerBookingStatus(input.status)) throw new Error("Status kerja sama tidak valid.");
    const existing = id == null ? undefined : current.influencerSchedules.find((item) => String(item.id) === String(id));
    if (id != null && !existing) throw new Error("Jadwal tidak ditemukan.");
    const oldCampaign = existing && current.campaigns.find((item) => existing.campaignId != null ? String(item.id) === String(existing.campaignId) : item.name === existing.campaign);
    if (oldCampaign && String(oldCampaign.id) !== String(campaignId)) throw new Error("Jadwal sudah terhubung ke Campaign lain.");
    const wasUnlinked = Boolean(existing && !existing.campaignId && !oldCampaign);
    const themeId = input.themeId !== undefined ? input.themeId : existing?.themeId;
    const theme = current.influencerThemes.find((item) => String(item.id) === String(themeId) && String(item.campaignId) === String(campaignId));
    if ((themeId != null && !theme) || (!existing && !theme)) throw new Error("Pilih tema dari Campaign ini.");
    const influencer = current.influencers.find((item) => String(item.id ?? item.name) === String(input.influencerId));
    if (!existing && !influencer) throw new Error("Pilih influencer dari Data Influencer.");
    if (existing && input.influencerId !== undefined && String(input.influencerId) !== String(existing.influencerId)) throw new Error("Influencer pada jadwal existing tidak dapat diganti.");
    let selectedRateCard = existing?.rateCardId ? influencer?.rateCards?.find((card) => String(card.id) === String(existing.rateCardId)) : undefined;
    let selectedAccount = existing?.usernameSnapshot ? influencer?.accounts?.find((account) => account.username === existing.usernameSnapshot && account.platform === existing.platform) : undefined;
    let collaborationType = existing?.collaborationType || "Influencer";
    let bookingRate = existing?.rate ?? influencer?.rate ?? 0;
    let barterValue = existing?.barterValue ?? 0;
    if (!existing) {
      selectedRateCard = influencer?.rateCards?.find((card) => String(card.id) === String(input.rateCardId));
      if (!selectedRateCard) throw new Error("Pilih paket rate card dari profil influencer.");
      selectedAccount = input.accountId == null ? undefined : influencer?.accounts?.find((account) => String(account.id) === String(input.accountId));
      if (!selectedAccount) throw new Error("Pilih akun sosial dari profil influencer.");
      if (selectedAccount && selectedRateCard.platform !== "Lainnya" && selectedAccount.platform !== selectedRateCard.platform) throw new Error("Platform akun harus sama dengan platform paket.");
      collaborationType = influencer!.collaborationType || "Influencer";
      const manager = canManageUsers(identity);
      if (input.agreedRate !== undefined && !manager) throw new Error("Hanya Super Admin dapat menyesuaikan harga paket.");
      const agreed = input.agreedRate ?? selectedRateCard.amount;
      if (!Number.isSafeInteger(agreed) || agreed < 0 || agreed > 999_999_999_999) throw new Error("Harga paket yang disepakati tidak valid.");
      bookingRate = collaborationType === "Influencer" ? agreed : 0;
      barterValue = collaborationType === "Barter Endorse" ? agreed : 0;
    } else if (input.rateCardId !== undefined || input.accountId !== undefined || input.agreedRate !== undefined) {
      throw new Error("Snapshot paket jadwal lama tidak dapat diganti.");
    }
    const visitDate = input.visitDate !== undefined ? input.visitDate : existing?.visitDate || null;
    const uploadDate = input.uploadDate !== undefined ? input.uploadDate : existing?.uploadDate === undefined ? existing?.date || null : existing.uploadDate;
    const validation = validateInfluencerScheduleDates(visitDate || "", uploadDate || "");
    if (validation) throw new Error(validation);
    const nextStatus = input.status ?? existing?.status ?? "Terjadwal";
    const contentLink = nextStatus === "Selesai"
      ? input.contentLink !== undefined ? (input.contentLink || "").trim() || null : existing?.contentLink ?? null
      : null;
    if (input.contentLink !== undefined) {
      const linkValidation = validateInfluencerContentLink(input.contentLink || "");
      if (linkValidation) throw new Error(linkValidation);
    }
    if (input.contentLink && nextStatus !== "Selesai") throw new Error("Link konten hanya dapat diisi ketika status kerja sama Selesai.");
    const generation = sessionGeneration.current;
    let saved: InfluencerSchedule;
    if (authMode === "live") {
      if (!supabase || !liveContext) throw new Error("Koneksi workspace belum tersedia.");
      saved = await persistCampaignInfluencerBooking(supabase, campaign, input, id);
    } else {
      saved = { ...(existing || { id: globalThis.crypto.randomUUID(), influencer: influencer!.name, influencerId: influencer!.id ?? null, platform: (selectedAccount?.platform || (selectedRateCard?.platform === "Lainnya" ? influencer!.platform : selectedRateCard?.platform) || influencer!.platform) as InfluencerSchedule["platform"], spent: 0, status: "Terjadwal", paymentStatus: "Belum dibayar", time: "00:00" }), campaignId, campaign: campaign.name, themeId: theme?.id ?? null, themeName: theme?.name, content: theme?.name || existing?.content || "", contentLink, visitDate, uploadDate, date: uploadDate || visitDate || "", notes: input.notes !== undefined ? input.notes : existing?.notes, status: nextStatus, collaborationType, rateCardId: existing?.rateCardId ?? selectedRateCard?.id ?? null, rateCardNameSnapshot: existing?.rateCardNameSnapshot ?? selectedRateCard?.name, rateCardPlatformSnapshot: existing?.rateCardPlatformSnapshot ?? selectedRateCard?.platform, rateCardDetailsSnapshot: existing?.rateCardDetailsSnapshot ?? selectedRateCard?.details, usernameSnapshot: existing?.usernameSnapshot ?? selectedAccount?.username ?? null, rate: bookingRate, barterValue, spent: existing?.spent ?? 0 };
    }
    if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah. Coba kembali.");
    const statusEvent = authMode !== "live" && existing && existing.status !== saved.status ? {
      id: globalThis.crypto.randomUUID(), bookingId: saved.id, campaignId,
      influencerName: saved.influencer, contentLabel: theme?.name || saved.themeName || saved.content || "Konten influencer",
      actorId: identity?.id ?? identity?.username ?? null, actorName: identity?.name || "Anggota tim",
      fromStatus: existing.status, toStatus: saved.status, createdAt: new Date().toISOString(),
    } : null;
    setData((state) => ({ ...state, campaigns: wasUnlinked ? state.campaigns.map((item) => String(item.id) === String(campaignId) ? { ...item, spent: item.spent + (existing?.spent || 0) } : item) : state.campaigns, influencerSchedules: existing ? state.influencerSchedules.map((item) => String(item.id) === String(saved.id) ? saved : item) : [saved, ...state.influencerSchedules.filter((item) => String(item.id) !== String(saved.id))], ...(statusEvent ? { influencerStatusHistory: [statusEvent, ...(state.influencerStatusHistory || [])] } : {}) }));
    return saved;
  };

  const deleteInfluencerBooking = async (campaignId: EntityId, id: EntityId) => {
    const current = dataRef.current;
    const campaign = current.campaigns.find((item) => String(item.id) === String(campaignId));
    if (!campaign || !canEditCampaignInfluencers(identity, campaign)) throw new Error("Akun tidak dapat menghapus jadwal pada Campaign ini.");
    const existing = current.influencerSchedules.find((item) => String(item.id) === String(id));
    if (!existing) throw new Error("Jadwal tidak ditemukan.");
    const linked = existing.campaignId != null ? String(existing.campaignId) === String(campaignId) : existing.campaign === campaign.name;
    if (!linked) throw new Error("Jadwal tidak terhubung ke Campaign ini.");
    const generation = sessionGeneration.current;
    if (authMode === "live") {
      if (!supabase || !liveContext) throw new Error("Koneksi workspace belum tersedia.");
      await persistCampaignInfluencerBookingDelete(supabase, campaignId, id);
    }
    if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah. Coba kembali.");
    setData((state) => ({ ...state, campaigns: state.campaigns.map((item) => String(item.id) === String(campaignId) ? { ...item, spent: Math.max(0, item.spent - existing.spent) } : item), influencerSchedules: state.influencerSchedules.filter((item) => String(item.id) !== String(id)) }));
  };

  const setInfluencerBookingPayment = async (campaignId: EntityId, id: EntityId, status: InfluencerPaymentStatus, amount?: number) => {
    const current = dataRef.current;
    const campaign = current.campaigns.find((item) => String(item.id) === String(campaignId));
    if (!campaign || !isTaskManager(identity) || !canEditCampaignInfluencers(identity, campaign)) throw new Error("Hanya Super Admin yang dapat mengubah pembayaran pada Campaign aktif.");
    if (!influencerPaymentStatuses.includes(status)) throw new Error("Status pembayaran tidak valid.");
    const existing = current.influencerSchedules.find((item) => String(item.id) === String(id));
    const linked = existing?.campaignId != null ? String(existing.campaignId) === String(campaignId) : existing?.campaign === campaign.name;
    if (!existing || !linked) throw new Error("Jadwal tidak ditemukan pada Campaign ini.");
    if (existing.collaborationType === "Barter Endorse") throw new Error("Booking barter tidak memiliki pembayaran tunai.");
    const calculated = calculateInfluencerPaidAmount(status, existing.rate, amount);
    if (calculated.error || calculated.amount === undefined) throw new Error(calculated.error || "Nominal pembayaran tidak valid.");
    const nextAmount = calculated.amount;
    const generation = sessionGeneration.current;
    let saved: InfluencerSchedule;
    if (authMode === "live") {
      if (!supabase || !liveContext) throw new Error("Koneksi workspace belum tersedia.");
      saved = await persistCampaignInfluencerPayment(supabase, campaignId, id, status, nextAmount);
    } else {
      saved = { ...existing, spent: nextAmount, paymentStatus: status };
    }
    if (generation !== sessionGeneration.current) throw new Error("Sesi pengguna berubah. Coba kembali.");
    const delta = nextAmount - existing.spent;
    setData((state) => ({ ...state, campaigns: state.campaigns.map((item) => String(item.id) === String(campaignId) ? { ...item, spent: Math.max(0, item.spent + delta) } : item), influencerSchedules: state.influencerSchedules.map((item) => String(item.id) === String(id) ? saved : item) }));
    return saved;
  };

  const common = { saveCampaign, saveInfluencerProfile, saveInfluencerTheme, deleteInfluencerTheme, saveInfluencerBooking, deleteInfluencerBooking, setInfluencerBookingPayment, saveCampaignTimeline, saveCampaignMembers, createCampaignDiscussionNote, setCampaignNoteDashboardPin, createCampaignExpense, data, identity, mutateTask, decideTaskStatus, openTaskEditor, refreshTaskBoard, taskBoardError, saveCampaignKpi, openModal, openResetPin, navigate, notify, notifyAction, setData, getAccessToken, refreshData, campaignLifecycleAction, requestedCampaignId, onCampaignOpened: () => setRequestedCampaignId(null), uploadMedia, uploadOwnAvatar, workspaceId: liveContext?.workspaceId, liveMode: Boolean(supabase && liveContext) };

  const authenticate = async (action: "login" | "signup", name: string, username: string, email: string, whatsapp: string, pin: string) => {
    const demo = action === "login" && !supabase && demoLoginAllowed()
      ? await authenticateLocalUser(loadLocalData().users, username, pin)
      : undefined;
    const enterDemoMode = (account: UserIdentity) => {
      sessionGeneration.current++;
      latestTasks.current.clear();
      taskQueues.current.clear();
      const localData = loadLocalData();
      notificationSnapshot.current = null;
      setIdentity(account);
      setData(localData);
      setNotifications(loadLocalNotifications());
      setLiveContext(null);
      hydrated.current = true;
      setAuthMode("demo");
      return "Mode demo aktif. Data disimpan hanya di browser ini.";
    };

    if (!supabase) {
      if (!demoLoginAllowed()) throw new Error("Konfigurasi database production belum tersedia. Hubungi Super Admin.");
      if (!demo) throw new Error("Username atau PIN tidak sesuai.");
      return enterDemoMode(demo);
    }

    if (action !== "login") throw new Error("Akun dibuat oleh Super Admin melalui Manajemen User.");

    authAttempt.current = true;
    const { data: signInData, error } = await supabase.auth.signInWithPassword({ email: authEmailFromUsername(username), password: pin });
    if (error) { authAttempt.current = false; throw error; }
    if (!signInData.session || !signInData.user) { authAttempt.current = false; throw new Error("Sesi login tidak berhasil dibuat."); }
    setAuthMode("loading");
    try { await connectLiveWorkspace(signInData.session.access_token, signInData.user.id, email); }
    catch (failure) { setSessionError((failure as Error).message); clearSession(); throw failure; }
    finally { authAttempt.current = false; }
  };

  if (authMode === "loading") return <div className="login-screen auth-loading"><BrandLogo /><strong>Menyiapkan workspace…</strong></div>;
  if (authMode === "signed-out") return <LoginScreen connectionError={sessionError} configured={isSupabaseConfigured()} onAuthenticate={authenticate} />;

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} id="sidebar">
      <div className="brand-wrap"><BrandLogo /><div className="brand-copy"><div className="brand-name">Ngapaya</div><div className="brand-subtitle">Marketing HBI</div></div><button className="icon-button sidebar-collapse" onClick={() => setCollapsed(!collapsed)} aria-label="Ciutkan sidebar"><Icon name="panel" /></button><button className="icon-button close-sidebar" onClick={() => setSidebarOpen(false)} aria-label="Tutup menu"><Icon name="close" /></button></div>
      <nav className="main-nav" aria-label="Navigasi utama">{navigation.filter((item) => !["users", "admin-notes"].includes(item.view) || canManageUsers(identity)).map((item) => {
        const locked = isDevelopmentMenuLocked(item.view, identity);
        return <div key={item.view}>{item.group && <div className={`nav-label ${item.group !== "WORKSPACE" ? "nav-gap" : ""}`}>{item.group}</div>}<button type="button" className={`nav-item ${currentView === item.view ? "active" : ""} ${locked ? "nav-item-locked" : ""}`} onClick={() => navigate(item.view)} aria-label={locked ? `${item.label}. Terkunci, klik untuk membukanya.` : undefined} title={locked ? `${item.label} — Klik untuk Membukanya` : undefined}>
          {locked ? <><div className="nav-lock-base" aria-hidden="true"><Icon className="nav-icon" name={item.icon} size={15} /><span>{item.label}</span></div><div className="nav-lock-overlay" aria-hidden="true"><Icon name="lock" size={13} /><span>Klik untuk Membukanya</span></div></> : <><Icon className="nav-icon" name={item.icon} size={15} /><span>{item.label}</span>{item.view === "campaigns" ? <span className="nav-count">{data.campaigns.filter((campaign) => (campaign.lifecycleStatus || "active") === "active").length}</span> : item.view === "todo" ? <span className="nav-count">{filteredBoardTasks(data, identity, { brand: "all", pic: "all", campaign: "all" }).length}</span> : item.count && <span className="nav-count">{item.count}</span>}</>}
        </button></div>;
      })}</nav>
    </aside>
    <button className={`sidebar-backdrop ${sidebarOpen ? "visible" : ""}`} onClick={() => setSidebarOpen(false)} aria-label="Tutup menu" />
    <main className="main-area"><header className="topbar"><div className="topbar-left"><button className="icon-button menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Buka menu"><Icon name="menu" /></button><div className="crumbs"><span>Workspace</span><b>/</b><strong>{titles[currentView]}</strong></div></div><div className="topbar-actions"><label className="search-box"><Icon name="search" /><input type="search" placeholder="Cari apa saja..." aria-label="Cari di workspace" onKeyDown={(event) => { if (event.key === "Enter") notify(`Pencarian “${event.currentTarget.value}” siap digunakan.`); }} /></label><button className="icon-button theme-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Ubah tema"><Icon name={theme === "dark" ? "sun" : "moon"} /></button><div className="notification-anchor"><button className={`icon-button notification-button ${unreadNotifications(notifications).length ? "has-unread" : ""}`} onClick={() => { setNotificationOpen((open) => !open); if (authMode === "live") void refreshNotifications(); }} aria-label={unreadNotifications(notifications).length ? `Notifikasi, ${unreadNotifications(notifications).length} belum dibaca` : "Notifikasi"}><Icon name="bell" /><i aria-hidden="true" /></button>{notificationOpen && <NotificationPanel notifications={notifications} onOpen={(notification) => void markNotificationRead(notification)} onMarkAll={() => void markAllNotificationsRead()} />}</div><button className="top-profile" onClick={() => navigate("account")}><Avatar name={identity.name} src={identity.avatarUrl} /><span className="top-profile-copy"><strong>{identity.name}</strong><small>{identity.role}</small></span><span className="chevron">⌄</span></button></div></header>
      <div className="page-content">{sessionError && <div className="task-board-error" role="alert">{sessionError}<button type="button" className="button button-soft button-sm" onClick={() => window.location.reload()}>Coba lagi</button></div>}{currentView === "dashboard" && <DashboardView {...common} />}{currentView === "campaigns" && <CampaignsView {...common} />}{currentView === "brands" && <BrandView {...common} />}{currentView === "todo" && <TodoView {...common} />}{currentView === "calendar" && <CalendarView {...common} />}{currentView === "requests" && <RequestsView {...common} />}{currentView === "partners" && <PartnersView {...common} />}{currentView === "influencers" && <InfluencersView {...common} />}{currentView === "analytics" && <AnalyticsView {...common} />}{currentView === "social-hub" && <SocialHubView {...common} />}{currentView === "account" && <AccountView {...common} />}{currentView === "users" && <UserManagementView users={data.users} identity={identity} onSave={saveManagedUser} onResetPin={resetPin} onUploadAvatar={uploadUserAvatar} />}{currentView === "admin-notes" && <AdminNotesView notes={data.adminDashboardNotes || []} users={data.users} identity={identity} onSave={saveAdminNote} onDelete={deleteAdminNote} />}</div>
    </main>
    <div className={`toast ${toast ? "show" : ""}`} role="status">{toast?.message}{toast?.action && <button type="button" onClick={() => { toast.action?.(); setToast(null); }}>{toast.actionLabel}</button>}</div>
    {modal === "task" && isTaskManager(identity) && <TaskDialog key={`${editingTaskId ?? "new"}-${newTaskCampaignId ?? "none"}`} data={data} task={editingTaskId == null ? null : data.tasks.find((task) => String(task.id) === String(editingTaskId))} initialCampaignId={newTaskCampaignId} onClose={closeModal} onSave={saveTask} />}
    {modal && modal !== "task" && (modal !== "campaign" || isTaskManager(identity)) && <AppModal createCampaignRecord={createCampaignRecord} type={modal} data={data} close={closeModal} identity={identity} notify={notify} resetPin={resetPin} resetUser={resetUser} changePin={changePin} createUser={createUser} setData={setData} onCampaignCreated={(campaignId) => { setRequestedCampaignId(campaignId); setView("campaigns"); }} />}
    {developmentPaywallOpen && !canManageUsers(identity) && <DevelopmentPaywallDialog onClose={() => setDevelopmentPaywallOpen(false)} />}
  </div>;
}

function LoginScreen({ configured, connectionError, onAuthenticate }: { connectionError?: string; configured: boolean; onAuthenticate: (action: "login", name: string, username: string, email: string, whatsapp: string, pin: string) => Promise<string | void> }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const pendingRef = useRef(false);
  const available = configured || demoLoginAllowed();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (pendingRef.current || !available) return;
    pendingRef.current = true; setPending(true); setMessage("");
    const values = new FormData(event.currentTarget);
    try {
      const result = await onAuthenticate("login", "", String(values.get("username") || ""), "", "", String(values.get("pin") || ""));
      if (result) setMessage(result);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Autentikasi gagal. Silakan coba lagi."); }
    finally { pendingRef.current = false; setPending(false); }
  };
  return <div className="login-screen" style={{ display: "grid" }}><div className="card login-card">
    <BrandLogo /><h1>Selamat datang kembali</h1><p>Satu ruang kerja untuk seluruh kegiatan marketing HBI.<br />Masuk dengan username dan PIN.</p>
    <form className="form-stack" onSubmit={submit}>
      <div className="form-field"><label>Username</label><input className="input" name="username" required minLength={3} maxLength={32} pattern="[a-z][a-z0-9._-]{2,31}" autoCapitalize="none" autoComplete="username" placeholder="contoh: andi.saputra" /></div>
      <div className="form-field"><label>PIN 6 angka</label><input className="input" name="pin" type="password" required minLength={6} maxLength={6} pattern="[0-9]{6}" inputMode="numeric" autoComplete="current-password" /></div>
      <button className="button button-primary" type="submit" disabled={pending || !available}>{pending ? "Memproses…" : "Masuk ke workspace ↗"}</button>
    </form>
    {(message || connectionError) && <div className="auth-message" role="status">{message || connectionError}</div>}
    <div className="auth-help">Lupa PIN? Hubungi Super Admin untuk reset PIN.</div>
    <div className="demo-hint">{configured ? "Login aman dengan username + PIN melalui Supabase" : !available ? "Konfigurasi Supabase production belum tersedia." : <>Mode demo lokal · Username: <strong>{demoAccountCredentials.username}</strong> · PIN: <strong>{demoAccountCredentials.pin}</strong></>}</div>
  </div></div>;
}

const modalInfo: Record<string, { title: string; description: string }> = {
  task: { title: "Tambah tugas baru", description: "Buat tugas dan pastikan PIC serta deadline-nya jelas." },
  campaign: { title: "Buat Campaign Baru", description: "Mulai dari informasi dasar. Detail bisa dilengkapi nanti." },
  content: { title: "Jadwalkan konten", description: "Konten baru akan masuk kalender dengan status Draf." },
  request: { title: "Buat request / ide", description: "Catat masukan agar bisa ditindaklanjuti dengan jelas." },
  influencer: { title: "Tambah influencer", description: "Simpan profil KOL untuk kolaborasi Instagram, Facebook, atau TikTok." },
  transaction: { title: "Catat transaksi", description: "Dokumentasikan rencana dan realisasi pengeluaran marketing." },
  password: { title: "Ganti PIN", description: "PIN baru harus terdiri dari 6 angka." },
  resetPin: { title: "Reset PIN anggota", description: "Gunakan fitur ini hanya jika Anda adalah Super Admin." },
  user: { title: "Tambah pengguna", description: "Berikan akses sesuai tanggung jawab anggota tim." },
  metrics: { title: "Isi data sosial manual", description: "Gunakan saat konektor API belum diaktifkan." },
};

function AppModal({ createCampaignRecord, type, data, close, identity, notify, resetPin, resetUser, changePin, createUser, setData, onCampaignCreated }: { createCampaignRecord: (campaign: Campaign) => Promise<void>; type: string; data: AppData; close: () => void; identity: UserIdentity; notify: (message: string) => void; resetPin: (username: string, pin: string) => Promise<void>; resetUser: User | null; changePin: (pin: string) => Promise<void>; createUser: (input: { name: string; username: string; email: string; whatsapp: string; role: string; pin: string }) => Promise<void>; setData: React.Dispatch<React.SetStateAction<AppData>>; onCampaignCreated: (campaignId: string) => void }) {
  const info = modalInfo[type];
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState("");
  const campaignIdRef = useRef(globalThis.crypto.randomUUID());
  const submitting = useRef(false);
  if (!info) return null;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    const formData = new FormData(event.currentTarget);
    const values: Record<string, FormDataEntryValue> = Object.fromEntries(formData.entries());
    values.assigneeIds = formData.getAll("assigneeIds").map(String).join(",");
    submitting.current = true; setPending(true);
    setFormError("");
    try {
      if (type === "resetPin") await resetPin(String(values.username || ""), String(values.pin || ""));
      else if (type === "password") await changePin(String(values.pin || ""));
      else if (type === "user") await createUser({ name: String(values.name || ""), username: String(values.username || ""), email: String(values.email || ""), whatsapp: String(values.whatsapp || ""), role: String(values.role || ""), pin: String(values.pin || "") });
      else if (type === "campaign") {
        if (!isTaskManager(identity)) throw new Error("Hanya Super Admin dapat membuat Campaign.");
        const name = String(values.name || "").trim();
        const brand = String(values.brand || "").trim();
        const startDate = String(values.startDate || "");
        const endDate = String(values.endDate || "");
        const brands = existingBrands(data);
        if (!name) throw new Error("Nama Campaign wajib diisi.");
        if (!brand || !brands.includes(brand)) throw new Error("Pilih Brand dari data yang tersedia.");
        const periodError = validateCampaignPeriod(startDate, endDate);
        if (periodError) throw new Error(periodError);
        const id = campaignIdRef.current;
        const campaign = createBasicCampaign(id, { name, brand, startDate, endDate, objective: String(values.objective || "") });
        await createCampaignRecord(campaign);
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
      submitting.current = false; setPending(false);
    }
  };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) close(); }}><section className={`modal ${type === "campaign" ? "campaign-create-modal" : ""}`}><div className="modal-head"><div><h2>{info.title}</h2><p>{info.description}</p></div><button type="button" className="icon-button modal-close" onClick={close} aria-label="Tutup" disabled={pending}><Icon name="close" /></button></div><form onSubmit={submit}>{formFields(type, data, resetUser, identity)}{formError && <div className="campaign-form-error" role="alert"><Icon name="alert" size={14} />{formError}</div>}<div className="modal-actions">{type === "metrics" && <button type="button" className="button button-ghost" onClick={() => { setData(resetLocalData()); close(); notify("Data demo dikembalikan ke kondisi awal."); }}>Reset demo</button>}<button type="button" className="button button-ghost" onClick={close} disabled={pending}>Batal</button><button type="submit" className="button button-primary" disabled={pending}>{pending ? "Membuat…" : type === "campaign" ? "Buat Campaign" : "Simpan perubahan"}</button></div></form></section></div>;
}

function Field({ label, name, required, type = "text", defaultValue, placeholder, minLength, maxLength, pattern, inputMode, autoComplete, readOnly }: { label: string; name: string; required?: boolean; type?: string; defaultValue?: string; placeholder?: string; minLength?: number; maxLength?: number; pattern?: string; inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search"; autoComplete?: string; readOnly?: boolean }) { return <div className="form-field"><label>{label}{required ? " *" : ""}</label><input className="modal-input" name={name} type={type} required={required} defaultValue={defaultValue} placeholder={placeholder} minLength={minLength} maxLength={maxLength} pattern={pattern} inputMode={inputMode} autoComplete={autoComplete} readOnly={readOnly} /></div>; }
function SelectField({ label, name, values, required = false, placeholder }: { label: string; name: string; values: string[]; required?: boolean; placeholder?: string }) { return <div className="form-field"><label>{label}{required ? " *" : ""}</label><select className="modal-input" name={name} required={required} defaultValue={placeholder ? "" : values[0]}>{placeholder && <option value="" disabled>{placeholder}</option>}{values.map((value) => <option key={value}>{value}</option>)}</select></div>; }

function existingBrands(data: AppData) {
  return Array.from(new Set([
    ...(data.brands || []).map((item) => item.name),
    ...data.campaigns.map((item) => item.brand),
    ...data.content.map((item) => item.brand),
    ...data.requests.map((item) => item.brand),
    ...data.transactions.map((item) => item.brand),
  ].map((brand) => brand.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right, "id"));
}

function formFields(type: string, data: AppData, resetUser: User | null = null, identity: UserIdentity | null = null) {
  if (type === "campaign") return <div className="form-stack campaign-create-fields"><Field label="Nama Campaign" name="name" required placeholder="Contoh: Grand Opening RUMA Purwokerto" /><SelectField label="Brand" name="brand" values={existingBrands(data)} required placeholder="Pilih brand" /><div className="campaign-form-group"><div><strong>Periode Campaign</strong><span>Opsional, dapat diatur nanti.</span></div><div className="two-fields"><Field label="Tanggal mulai" name="startDate" type="date" /><Field label="Tanggal selesai" name="endDate" type="date" /></div></div><div className="form-field"><label>Tujuan Singkat</label><textarea className="modal-input campaign-objective-input" name="objective" maxLength={280} placeholder="Apa tujuan utama campaign ini?" /></div><div className="campaign-create-note"><Icon name="info" size={15} /><span>Brief, KPI, promo, timeline, tugas, influencer, dan budget dapat dilengkapi melalui Campaign Workspace setelah dibuat.</span></div></div>;
  if (type === "content") return <div className="form-stack"><Field label="Judul konten" name="title" required /><div className="two-fields"><SelectField label="Brand" name="brand" values={existingBrands(data)} /><SelectField label="Platform" name="platform" values={["Instagram", "Facebook", "Threads", "TikTok"]} /></div><Field label="Tanggal tayang" name="date" type="date" required defaultValue="2026-10-20" /><div className="form-field"><label>Caption / brief</label><textarea className="modal-input" name="caption" /></div></div>;
  if (type === "request") return <div className="form-stack"><Field label="Nama pengirim" name="sender" required /><div className="form-field"><label>Isi request / ide *</label><textarea className="modal-input" name="title" required /></div><div className="two-fields"><SelectField label="Brand" name="brand" values={existingBrands(data)} /><SelectField label="Prioritas" name="priority" values={["Sedang", "Tinggi", "Rendah"]} /></div></div>;
  if (type === "influencer") return <div className="form-stack"><Field label="Nama influencer" name="name" required /><div className="two-fields"><SelectField label="Platform" name="platform" values={["Instagram", "Facebook", "TikTok"]} /><Field label="Niche" name="niche" /></div><div className="two-fields"><Field label="Rate card" name="rate" type="number" /><Field label="Followers" name="followers" /></div></div>;
  if (type === "transaction") return <div className="form-stack"><Field label="Vendor" name="vendor" required /><div className="two-fields"><SelectField label="Kategori" name="category" values={["Digital Ads", "KOL & Influencer", "Produksi Konten", "Event & Aktivasi"]} /><Field label="Jumlah" name="amount" type="number" required /></div><div className="two-fields"><SelectField label="Tipe" name="transactionType" values={["Realisasi", "Rencana"]} /><SelectField label="Brand" name="brand" values={existingBrands(data)} /></div></div>;
  if (type === "user") return <div className="form-stack"><Field label="Nama lengkap" name="name" required /><Field label="Username" name="username" required /><Field label="PIN 6 angka" name="pin" type="password" required minLength={6} maxLength={6} pattern="[0-9]{6}" inputMode="numeric" /><SelectField label="Jabatan" name="role" values={["Super Admin", "Content Creator", "Creative Designer", "Support Marketing", "Finance", "Tim Konten", "Guest"]} /></div>;
  if (type === "password") return <div className="form-stack"><Field label="PIN baru" name="pin" type="password" required minLength={6} maxLength={6} pattern="[0-9]{6}" inputMode="numeric" autoComplete="new-password" /></div>;
  if (type === "resetPin") return <div className="form-stack"><Field label="Username anggota" name="username" required defaultValue={resetUser?.username} readOnly={Boolean(resetUser?.username)} /><Field label="PIN baru" name="pin" type="password" required minLength={6} maxLength={6} pattern="[0-9]{6}" inputMode="numeric" autoComplete="new-password" /></div>;
  return <div className="form-stack"><SelectField label="Platform" name="platform" values={["Instagram", "Facebook", "Threads", "TikTok"]} /><div className="two-fields"><Field label="Followers" name="followers" type="number" required /><Field label="Reach" name="reach" type="number" required /></div><div className="two-fields"><Field label="Impressions" name="impressions" type="number" required /><Field label="Engagement (%)" name="engagement" type="number" required /></div><Field label="Video views" name="views" type="number" required /></div>;
}

const successMessages: Record<string, string> = { task: "Tugas baru berhasil ditambahkan.", campaign: "Campaign baru dibuat sebagai Rencana.", content: "Konten masuk ke kalender sebagai Draf.", request: "Request baru berhasil dicatat.", influencer: "Influencer berhasil ditambahkan.", transaction: "Transaksi berhasil dicatat.", user: "Pengguna baru berhasil ditambahkan.", password: "PIN berhasil diganti.", resetPin: "PIN anggota berhasil direset.", profile: "Profil berhasil diperbarui.", metrics: "Data sosial manual berhasil disimpan." };

function applyModal(type: string, values: Record<string, FormDataEntryValue>, current: AppData): AppData {
  const value = (key: string) => String(values[key] ?? "");
  if (type === "content") { const item: ContentItem = { id: globalThis.crypto.randomUUID(), title: value("title"), date: Number(value("date").slice(-2)), status: "Draf", brand: value("brand"), platform: value("platform") as ContentItem["platform"], scheduledAt: value("date") }; return { ...current, content: [...current.content, item] }; }
  if (type === "request") return { ...current, requests: [{ id: globalThis.crypto.randomUUID(), title: value("title"), sender: value("sender"), date: value("date") || new Date().toISOString().slice(0, 10), brand: value("brand"), priority: value("priority"), status: "Baru", icon: "✦" }, ...current.requests] };
  if (type === "influencer") { const item: Influencer = { id: globalThis.crypto.randomUUID(), name: value("name"), platform: value("platform") as Influencer["platform"], niche: value("niche") || "Belum diisi", rate: Number(value("rate")), followers: value("followers") || "—", engagement: "—", status: "Review" }; return { ...current, influencers: [...current.influencers, item] }; }
  if (type === "transaction") { const item: Transaction = { id: globalThis.crypto.randomUUID(), vendor: value("vendor"), category: value("category"), amount: Number(value("amount")), type: value("transactionType"), brand: value("brand"), date: new Date().toISOString().slice(0, 10), status: "Belum Dibayar" }; return { ...current, transactions: [item, ...current.transactions] }; }
  if (type === "user") { const user: User = { name: value("name"), username: value("username"), email: value("email"), whatsapp: value("whatsapp"), role: value("role"), status: "Aktif" }; return { ...current, users: [...current.users, user] }; }
  if (type === "metrics") { const platform = value("platform").toLowerCase() as "instagram" | "facebook" | "threads" | "tiktok"; const snapshot = { platform, date: "10 Okt", followers: Number(value("followers")), reach: Number(value("reach")), impressions: Number(value("impressions")), engagementRate: Number(value("engagement")), views: Number(value("views")) }; return { ...current, socialSnapshots: [...current.socialSnapshots.filter((item) => !(item.platform === platform && item.date === "10 Okt")), snapshot], socialAccounts: current.socialAccounts.map((account) => account.platform === platform ? { ...account, followers: snapshot.followers, lastSync: "Input manual · baru saja" } : account) }; }
  return current;
}
