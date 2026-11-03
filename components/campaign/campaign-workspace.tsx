"use client";

import { ClipboardEvent, ChangeEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { SaveCampaign, CampaignContentConfig, AppData, CampaignDiscussionNote, CampaignInfluencerActions, CampaignInfluencerTheme, CampaignKpiInput, CampaignTimelineConfig, EntityId, Task, TaskPatch, UserIdentity } from "@/lib/types";
import { emptyCampaignContent } from "@/lib/campaign-persistence";
import { datedPhase, defaultTimelinePhase, orderedPhases, phaseColor, phasePeriodLabel, phaseTimeState, validateTimeline } from "@/lib/campaign-timeline";
import { useJakartaToday } from "../use-jakarta-today";
import { isTaskAssignee, isTaskManager } from "@/lib/task-workflow";
import { CampaignOverviewTab } from "./campaign-overview-tab";
import { CampaignInfluencerTab } from "./campaign-influencer-tab";
import { taskDate } from "@/lib/campaign-overview";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format";
import { campaignPeriodLabel, formatCampaignPeriod, validateCampaignPeriod } from "@/lib/campaign-form";
import { canEditCampaignInfluencers, campaignInfluencerThemesForCampaign, displayInfluencerBookingStatus, displayInfluencerPaymentStatus, influencerPaymentStatusTone, nextCampaignInfluencerThemeCode } from "@/lib/campaign-influencer";
import { campaignCalendarEvents, calendarMonthCells, calendarMonthTitle, type CampaignCalendarEvent } from "@/lib/campaign-content-calendar";
import { Avatar, Icon, rupiah, StatusPill } from "@/components/ui";
import { TaskAssigneePicker } from "@/components/task-assignees";
import {
  CampaignAvatar,

  CampaignNote,
  CampaignPhase,
  CampaignPromo,
  CampaignSectionHeader,

  CampaignTaskRow,
  CreativeReference,
  CreativeReferenceCard,
  EmptyCampaignState,
  IntegrationNotice,
  PresentationBadge,
  PromoCard,
  PhaseCard,
} from "./campaign-primitives";

type Campaign = AppData["campaigns"][number];
type CampaignTab = "overview" | "brief" | "timeline" | "content" | "influencer" | "finance" | "discussion";
type CampaignDialogType = "info" | "brief" | "promo" | "phase" | "reference" | "influencer-theme" | "influencer-booking";

type PresentationState = {
  tagline: string;
  bigMessage: string;
  intro: string;
  instructions: string;
  steps: string[];
  phaseMode: boolean;
  phases: CampaignPhase[];
  taskPhase: Record<string, string>;

  promos: CampaignPromo[];
  references: CreativeReference[];
};

const tabs: Array<{ id: CampaignTab; label: string; icon: string }> = [
  { id: "overview", label: "Ringkasan", icon: "home" },
  { id: "brief", label: "Brief & Promo", icon: "book" },
  { id: "timeline", label: "Timeline & Tugas", icon: "check-square" },
  { id: "content", label: "Jadwal Konten Campaign", icon: "calendar" },
  { id: "influencer", label: "Influencer & Brief", icon: "users" },
  { id: "finance", label: "Keuangan", icon: "wallet" },
  { id: "discussion", label: "Diskusi", icon: "message" },
];

const emptyPresentation = (): PresentationState => ({
  tagline: "",
  bigMessage: "",
  intro: "",
  instructions: "",
  steps: [],
  phaseMode: false,
  phases: [],
  taskPhase: {},

  promos: [],
  references: [],
});

function entityKey(value: EntityId) {
  return String(value);
}

function campaignMemberSelection(data: AppData, campaign: Campaign) {
  const ids = new Set((data.campaignMembers || []).filter((member) => entityKey(member.campaignId) === entityKey(campaign.id)).map((member) => String(member.userId)));
  for (const task of data.tasks.filter((item) => entityKey(item.campaign ?? "") === entityKey(campaign.id))) {
    if (task.assigneeIds !== undefined) for (const id of task.assigneeIds) ids.add(String(id));
    else for (const name of task.pic.split(",").map((value) => value.trim())) {
      const user = data.users.find((item) => item.name === name || item.username === name);
      if (user) ids.add(String(user.id ?? user.username));
    }
  }
  return [...ids];
}

export function CampaignWorkspace({
  campaign,
  data,
  identity,
  loading = false,
  readOnly = false,
  error,
  onBack,
  onNavigate,
  setData,
  notify,
  getAccessToken,
  uploadMedia,
  workspaceId,
  onLifecycleAction,
  openTaskEditor,
  mutateTask,
  saveCampaignKpi,
  saveInfluencerTheme,
  deleteInfluencerTheme,
  saveInfluencerBooking,
  deleteInfluencerBooking,
  setInfluencerBookingPayment,
  saveCampaign,
  saveCampaignMembers,
  createCampaignDiscussionNote,
  setCampaignNoteDashboardPin,
  saveCampaignTimeline,
  initialTab = "overview",
  liveMode,
}: CampaignInfluencerActions & { saveCampaign: SaveCampaign;
  openTaskEditor: (id?: EntityId, campaignId?: EntityId) => void;
  mutateTask: (id: EntityId, patch: TaskPatch) => Promise<void>;
  saveCampaignKpi: (id: EntityId, input: CampaignKpiInput, existingId?: string) => Promise<void>;
  saveCampaignMembers: (campaignId: EntityId, memberIds: EntityId[]) => Promise<void>;
  createCampaignDiscussionNote: (campaignId: EntityId, body: string, replyTo?: string) => Promise<CampaignDiscussionNote>;
  setCampaignNoteDashboardPin: (campaignId: EntityId, noteId: string, pinned: boolean) => Promise<void>;
  saveCampaignTimeline: (id: EntityId, phaseMode: boolean, phases: CampaignPhase[], expectedVersion?: number) => Promise<void>;
  initialTab?: CampaignTab;
  liveMode?: boolean;
  campaign?: Campaign;
  data: AppData;
  identity?: UserIdentity;
  loading?: boolean;
  readOnly?: boolean;
  error?: string;
  onBack: () => void;
  onNavigate: (view: string) => void;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  notify: (message: string) => void;
  getAccessToken?: () => Promise<string | null>;
  uploadMedia?: (file: File, bucket?: string, prefix?: string) => Promise<string>;
  workspaceId?: string;
  onLifecycleAction?: (action: "archive" | "unarchive" | "trash") => void;
}) {
  if (loading) return <CampaignWorkspaceSkeleton />;
  if (error || !campaign) {
    return <div className="card campaign-state-card"><EmptyCampaignState icon="alert" title="Detail campaign tidak dapat dibuka" description={error || "Campaign mungkin sudah dihapus atau tidak tersedia di workspace ini."} action={<button className="button button-soft" onClick={onBack}><Icon name="arrow-left" size={14} />Kembali ke daftar</button>} /></div>;
  }
  return <CampaignWorkspaceContent saveCampaign={saveCampaign} saveInfluencerTheme={saveInfluencerTheme} deleteInfluencerTheme={deleteInfluencerTheme} saveInfluencerBooking={saveInfluencerBooking} deleteInfluencerBooking={deleteInfluencerBooking} setInfluencerBookingPayment={setInfluencerBookingPayment} saveCampaignMembers={saveCampaignMembers} createCampaignDiscussionNote={createCampaignDiscussionNote} setCampaignNoteDashboardPin={setCampaignNoteDashboardPin} initialTab={initialTab} saveCampaignTimeline={saveCampaignTimeline} openTaskEditor={openTaskEditor} mutateTask={mutateTask} saveCampaignKpi={saveCampaignKpi} liveMode={liveMode} key={campaign.id} campaign={campaign} data={data} identity={identity} readOnly={readOnly} onBack={onBack} onNavigate={onNavigate} setData={setData} notify={notify} getAccessToken={getAccessToken} uploadMedia={uploadMedia} workspaceId={workspaceId} onLifecycleAction={onLifecycleAction} />;
}

function CampaignWorkspaceSkeleton() {
  return <div className="campaign-skeleton" aria-label="Memuat detail campaign"><div className="campaign-skeleton-line wide" /><div className="campaign-skeleton-line short" /><div className="campaign-skeleton-tabs" /><div className="campaign-skeleton-grid"><div /><div /><div /></div></div>;
}

function CampaignWorkspaceContent({ saveCampaign, saveInfluencerTheme, deleteInfluencerTheme, saveInfluencerBooking, deleteInfluencerBooking, setInfluencerBookingPayment, saveCampaignMembers, createCampaignDiscussionNote, setCampaignNoteDashboardPin, campaign, data, identity, readOnly, onBack, onNavigate, setData, notify, getAccessToken, uploadMedia, workspaceId, onLifecycleAction, mutateTask, saveCampaignKpi, saveCampaignTimeline, initialTab, liveMode, openTaskEditor }: CampaignInfluencerActions & { saveCampaign: SaveCampaign; saveCampaignTimeline: (id: EntityId, phaseMode: boolean, phases: CampaignPhase[], expectedVersion?: number) => Promise<void>; saveCampaignMembers: (campaignId: EntityId, memberIds: EntityId[]) => Promise<void>; createCampaignDiscussionNote: (campaignId: EntityId, body: string, replyTo?: string) => Promise<CampaignDiscussionNote>; setCampaignNoteDashboardPin: (campaignId: EntityId, noteId: string, pinned: boolean) => Promise<void>; initialTab: CampaignTab; openTaskEditor: (id?: EntityId, campaignId?: EntityId) => void; mutateTask: (id: EntityId, patch: TaskPatch) => Promise<void>; saveCampaignKpi: (id: EntityId, input: CampaignKpiInput, existingId?: string) => Promise<void>; liveMode?: boolean; campaign: Campaign; data: AppData; identity?: UserIdentity; readOnly: boolean; onBack: () => void; onNavigate: (view: string) => void; setData: React.Dispatch<React.SetStateAction<AppData>>; notify: (message: string) => void; getAccessToken?: () => Promise<string | null>; uploadMedia?: (file: File, bucket?: string, prefix?: string) => Promise<string>; workspaceId?: string; onLifecycleAction?: (action: "archive" | "unarchive" | "trash") => void }) {
  const [activeTab, setActiveTab] = useState<CampaignTab>(initialTab);
  const [dialog, setDialog] = useState<CampaignDialogType | null>(null);
  const [editingTheme, setEditingTheme] = useState<CampaignInfluencerTheme | null>(null);
  const [dialogError, setDialogError] = useState("");
  const today = useJakartaToday();
  const [editingPhase, setEditingPhase] = useState<CampaignPhase | null>(null);
  const [dialogPending, setDialogPending] = useState(false);
  const dialogSaving = useRef(false);
  const dialogVersion = useRef(campaign.rowVersion ?? 1);
  const [presentation, setPresentation] = useState<PresentationState>(() => {
    const timeline = campaign.timelineConfig;
    return { ...emptyPresentation(), ...campaign.contentConfig, phaseMode: timeline?.phaseMode ?? false, phases: orderedPhases(timeline?.phases ?? []), taskPhase: timeline?.taskPhase ?? {} };
  });
  const presentationRef = useRef(presentation);
  const [selectedPhase, setSelectedPhase] = useState<string>("");
  const [taskView, setTaskView] = useState<"mine" | "all">("mine");
  const [replyTo, setReplyTo] = useState<string | undefined>();
  const [notePending, setNotePending] = useState(false);
  const [lifecycleMenuOpen, setLifecycleMenuOpen] = useState(false);
  const [referenceSync, setReferenceSync] = useState<"idle" | "loading" | "error">("idle");
  const canManage = isTaskManager(identity);
  const canEdit = !readOnly && identity?.accessRole !== "viewer";
  const canEditCampaign = canEdit && canManage;
  const canEditInfluencers = !readOnly && canEditCampaignInfluencers(identity, campaign);

  const campaignTasks = useMemo(() => data.tasks.filter((task) => entityKey(task.campaign ?? "") === entityKey(campaign.id) && (isTaskManager(identity) || task.status !== "Backlog")), [campaign.id, data.tasks, identity]);
  const campaignNotes = useMemo(() => (data.campaignNotes || []).filter((note) => entityKey(note.campaignId) === entityKey(campaign.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [campaign.id, data.campaignNotes]);
  const linkedInfluencers = useMemo(() => data.influencerSchedules.filter((item) => item.campaignId != null ? entityKey(item.campaignId) === entityKey(campaign.id) : item.campaign === campaign.name), [campaign.id, campaign.name, data.influencerSchedules]);
  const brandTransactionCandidates = useMemo(() => data.transactions.filter((item) => item.brand === campaign.brand), [campaign.brand, data.transactions]);
  const currentPhase = presentation.phases.find((phase) => phase.id === selectedPhase) || defaultTimelinePhase(presentation.phases, today);
  const activePhaseId = currentPhase?.id || "";

  useEffect(() => {
    let active = true;
    if (!getAccessToken) return () => { active = false; };
    setReferenceSync("loading");
    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) {
          if (active) setReferenceSync("idle");
          return;
        }
        const response = await fetch(`/api/campaigns/${campaign.id}/references`, { headers: { Authorization: `Bearer ${token}` } });
        const result = await response.json() as { references?: Array<{ id: string; title: string; url: string; kind: string; start_date: string; end_date: string; mime_type?: string | null }>; error?: string };
        if (!response.ok) throw new Error(result.error || "Referensi belum dapat dimuat.");
        if (!active) return;
        const next = { ...presentationRef.current, references: (result.references || []).map((reference) => ({ id: reference.id, title: reference.title, url: reference.url, kind: reference.kind, startDate: reference.start_date, endDate: reference.end_date, mimeType: reference.mime_type || undefined, source: "backend" as const })) };
        presentationRef.current = next;
        setPresentation(next);
        setReferenceSync("idle");
      } catch {
        if (active) setReferenceSync("error");
      }
    })();
    return () => { active = false; };
  }, [campaign.id, getAccessToken]);

  const updatePresentation = (update: (current: PresentationState) => PresentationState, allowMember = false) => {
    if (!canEditCampaign && !(allowMember && canEdit)) return notify(allowMember ? "Akun ini memiliki akses baca saja pada diskusi Campaign." : "Hanya Super Admin dapat mengubah informasi Campaign.");
    const next = update(presentationRef.current);
    presentationRef.current = next;
    setPresentation(next);
    const timelineConfig: CampaignTimelineConfig = { phaseMode: next.phaseMode, phases: next.phases, taskPhase: next.taskPhase };
    setData((current) => ({ ...current, campaigns: current.campaigns.map((item) => String(item.id) === String(campaign.id) ? { ...item, timelineConfig } : item) }));
  };
  const closeDialog = () => { if (dialogPending) return; setEditingPhase(null); setDialog(null); setDialogError(""); setEditingTheme(null); };
  const openDialog = (type: CampaignDialogType) => {
    const influencerDialog = type === "influencer-theme" || type === "influencer-booking";
    if (influencerDialog ? !canEditInfluencers : !canEditCampaign) return notify("Akun tidak memiliki izin untuk perubahan ini.");
    setEditingPhase(null);
    dialogVersion.current = campaign.rowVersion ?? 1;
    setDialog(type);
    if (type !== "influencer-theme") setEditingTheme(null);
    setDialogError("");
  };

  const editPhase = (phase: CampaignPhase) => {
    if (!canEditCampaign) return;
    dialogVersion.current = campaign.rowVersion ?? 1;
    setEditingPhase(phase); setDialog("phase"); setDialogError("");
  };
  const togglePhaseMode = async () => {
    if (!canEditCampaign || dialogPending) return;
    setDialogPending(true);
    try { await saveCampaignTimeline(campaign.id, !presentation.phaseMode, presentation.phases); notify("Pengaturan mode fase Campaign berhasil disimpan."); }
    catch (error) { notify((error as Error).message); }
    finally { setDialogPending(false); }
  };
  const runTaskChange = (taskId: EntityId, patch: TaskPatch) => {
    if (!canEdit) return notify("Akun ini memiliki akses baca saja.");
    void mutateTask(taskId, patch).catch((error) => notify(error.message));
  };
  const toggleTask = (taskId: EntityId) => {
    const task = data.tasks.find((item) => String(item.id) === String(taskId));
    if (task) runTaskChange(taskId, { status: task.status === "Done" ? "To Do" : "Done" });
  };
  const updateTaskStatus = (taskId: EntityId, status: Task["status"]) => runTaskChange(taskId, { status });
  const updateTaskAssignees = async (taskId: EntityId, assigneeIds: string[]) => {
    try { await mutateTask(taskId, { assigneeIds }); }
    catch (error) { notify((error as Error).message); throw error; }
  };
  const editTask = (taskId: EntityId) => openTaskEditor(taskId);
  useEffect(() => {
    setPresentation((current) => {
      const next = { ...current, ...campaign.contentConfig, ...campaign.timelineConfig, phases: orderedPhases(campaign.timelineConfig?.phases || []) };
      presentationRef.current = next;
      return next;
    });
  }, [campaign.timelineConfig, campaign.contentConfig]);

  const uploadReferenceImage = async (file: File) => {
    if (!uploadMedia || !workspaceId) throw new Error("Paste gambar membutuhkan koneksi Supabase aktif.");
    return uploadMedia(file, "campaign-references", `${workspaceId}/${campaign.id}`);
  };

  const uploadCampaignAvatar = async (file: File) => {
    if (!uploadMedia || !workspaceId) throw new Error("Unggah foto Campaign membutuhkan koneksi Supabase aktif.");
    return uploadMedia(file, "brand-assets", `${workspaceId}/${campaign.id}/campaign-avatar`);
  };

  const submitDialog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDialogError("");
    if (!dialog || dialogPending || dialogSaving.current) return;
    const values = new FormData(event.currentTarget);
    const value = (name: string) => String(values.get(name) || "").trim();

    if (dialog === "influencer-theme" || dialog === "influencer-booking") {
      if (!canEditInfluencers) return setDialogError("Akun tidak dapat mengedit influencer pada Campaign ini.");
      dialogSaving.current = true;
      setDialogPending(true);
      try {
        if (dialog === "influencer-theme") {
          const theme = await saveInfluencerTheme(campaign.id, { name: value("name"), phase: value("phase"), objective: value("objective"), requiredContent: value("requiredContent"), cta: value("cta") }, editingTheme?.id);
          notify(editingTheme ? "Tema konten diperbarui." : `Tema ${theme.code} ditambahkan.`);
        } else {
          await saveInfluencerBooking(campaign.id, { influencerId: value("influencerId"), themeId: value("themeId"), visitDate: value("visitDate") || null, uploadDate: value("uploadDate") || null });
          notify("Jadwal influencer berhasil disimpan.");
        }
        setDialog(null);
        setEditingTheme(null);
      } catch (error) { setDialogError((error as Error).message); }
      finally { dialogSaving.current = false; setDialogPending(false); }
      return;
    }
    if (!canEditCampaign) return setDialogError("Hanya Super Admin dapat menyimpan perubahan Campaign.");

    if (dialog === "info") {
      const name = value("name");
      const brand = value("brand");
      const startDate = value("startDate");
      const endDate = value("endDate");
      if (!name || !brand) return setDialogError("Nama Campaign dan Brand wajib diisi.");
      const periodError = validateCampaignPeriod(startDate, endDate);
      if (periodError) return setDialogError(periodError);
      const phaseError = validateTimeline(presentation.phases, { startDate, endDate });
      if (phaseError) return setDialogError(phaseError);
      const memberIds = values.getAll("campaignMemberIds").map(String);
      dialogSaving.current = true; setDialogPending(true);
      try {
        await saveCampaign(campaign.id, { name, brandId: data.brands.find((item) => item.name === brand)?.id || null, objective: value("objective"), avatarUrl: value("avatarUrl") || null, startDate: startDate || null, endDate: endDate || null, memberIds }, dialogVersion.current);
        notify("Informasi dasar Campaign berhasil disimpan.");
      } catch (error) { setDialogError((error as Error).message); return; }
      finally { dialogSaving.current = false; setDialogPending(false); }
    }

    if (dialog === "brief") {
      const bigMessage = value("bigMessage");
      if (!bigMessage) return setDialogError("Big message wajib diisi agar tim memahami arah komunikasi campaign.");
      const contentConfig: CampaignContentConfig = { ...emptyCampaignContent(), ...campaign.contentConfig, tagline: value("tagline"), bigMessage, intro: value("intro"), instructions: value("instructions"), steps: value("steps").split("\n").map((item) => item.trim()).filter(Boolean) };
      dialogSaving.current = true; setDialogPending(true);
      try { await saveCampaign(campaign.id, { contentConfig }, dialogVersion.current); notify("Brief Campaign berhasil disimpan."); }
      catch (error) { setDialogError((error as Error).message); return; }
      finally { dialogSaving.current = false; setDialogPending(false); }
    }

    if (dialog === "promo") {
      const startDate = value("startDate");
      const endDate = value("endDate");
      if (!value("title") || !startDate || !endDate) return setDialogError("Nama promo, tanggal mulai, dan tanggal selesai wajib diisi.");
      const periodError = validateCampaignPeriod(startDate, endDate);
      if (periodError) return setDialogError(periodError);
      const detail = value("detail");
      const promo: CampaignPromo = { id: globalThis.crypto.randomUUID(), title: value("title"), period: formatCampaignPeriod(startDate, endDate), startDate, endDate, detail: detail || "Mekanisme dan syarat belum dilengkapi.", status: "Draf" };
      const contentConfig: CampaignContentConfig = { ...emptyCampaignContent(), ...campaign.contentConfig, promos: [...presentation.promos, promo] };
      dialogSaving.current = true; setDialogPending(true);
      try { await saveCampaign(campaign.id, { contentConfig }, dialogVersion.current); notify("Promo Campaign berhasil disimpan."); }
      catch (error) { setDialogError((error as Error).message); return; }
      finally { dialogSaving.current = false; setDialogPending(false); }
    }

    if (dialog === "phase") {
      if (!canManage) return setDialogError("Hanya Super Admin dapat mengatur fase.");
      if (!value("name") || !value("startDate") || !value("endDate")) return setDialogError("Nama, tanggal mulai, dan tanggal selesai fase wajib diisi.");
      const existing = orderedPhases(presentation.phases);
      const phase: CampaignPhase = { ...editingPhase, id: editingPhase?.id || globalThis.crypto.randomUUID(), name: value("name"), startDate: value("startDate"), endDate: value("endDate"), period: editingPhase?.period || "", purpose: value("purpose"), color: editingPhase?.color || phaseColor({} as CampaignPhase, existing.length) };
      const phases = orderedPhases(editingPhase ? existing.map((item) => item.id === phase.id ? phase : item) : [...existing, phase]);
      const phaseError = validateTimeline(phases, campaign);
      if (phaseError) return setDialogError(phaseError);
      setDialogPending(true);
      try {
        await saveCampaignTimeline(campaign.id, true, phases, dialogVersion.current);
        setSelectedPhase(phase.id); setDialog(null); setEditingPhase(null);
        notify("Fase Campaign berhasil disimpan.");
      } catch (error) { setDialogError((error as Error).message || "Fase gagal disimpan. Coba lagi."); }
      finally { setDialogPending(false); }
      return;
    }

    if (dialog === "reference") {
      let url: URL;
      try { url = new URL(value("url")); } catch { return setDialogError("Masukkan URL referensi yang valid, termasuk https://."); }
      const startDate = value("startDate");
      const endDate = value("endDate");
      if (!value("title") || !["http:", "https:"].includes(url.protocol) || !startDate || !endDate) return setDialogError("Judul, URL, tanggal mulai, dan tanggal selesai wajib diisi.");
      const periodError = validateCampaignPeriod(startDate, endDate);
      if (periodError) return setDialogError(periodError);
      const kind = value("kind") || "Link";
      let reference: CreativeReference = { id: globalThis.crypto.randomUUID(), title: value("title"), url: url.toString(), kind, startDate, endDate, source: "presentation" };
      const token = await getAccessToken?.();
      if (token) {
        const response = await fetch(`/api/campaigns/${campaign.id}/references`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ title: reference.title, url: reference.url, kind, startDate, endDate, mimeType: values.get("mimeType") || undefined }) });
        const result = await response.json() as { reference?: { id: string; title: string; url: string; kind: string; start_date: string; end_date: string; mime_type?: string | null }; error?: string };
        if (!response.ok || !result.reference) return setDialogError(result.error || "Referensi belum dapat disimpan.");
        reference = { id: result.reference.id, title: result.reference.title, url: result.reference.url, kind: result.reference.kind, startDate: result.reference.start_date, endDate: result.reference.end_date, mimeType: result.reference.mime_type || undefined, source: "backend" };
      }
      updatePresentation((current) => ({ ...current, references: [...current.references, reference] }));
      notify(token ? "Referensi berhasil disimpan." : "Referensi ditambahkan sebagai draf sementara.");
    }

    closeDialog();
  };

  const assignTaskPhase = (taskId: EntityId, phaseId: string) => runTaskChange(taskId, { phaseId });

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab.id);
    document.getElementById(`campaign-tab-${nextTab.id}`)?.focus();
  };

  const tabContent = {
    overview: <CampaignOverviewTab campaign={campaign} data={data} identity={identity} canManage={canEditCampaign} liveMode={liveMode} workspaceId={workspaceId} onSaveKpi={saveCampaignKpi} />,
    brief: <BriefPromoTab campaign={campaign} presentation={presentation} canEdit={canEditCampaign} referenceSync={referenceSync} onEditBrief={() => openDialog("brief")} onAddPromo={() => openDialog("promo")} onAddReference={() => openDialog("reference")} />,
    timeline: <TimelineTasksTab today={today} onEditPhase={editPhase} phasePending={dialogPending} campaign={campaign} tasks={campaignTasks} users={data.users} identity={identity} readOnly={readOnly || identity?.accessRole === "viewer"} presentation={presentation} selectedPhaseId={activePhaseId} taskView={taskView} canEdit={canEditCampaign} onTaskView={setTaskView} onSelectPhase={setSelectedPhase} onAssignTaskPhase={assignTaskPhase} onTogglePhaseMode={() => void togglePhaseMode()} onAddPhase={() => openDialog("phase")} onAddTask={() => openTaskEditor(undefined, campaign.id)} onToggleTask={toggleTask} onTaskStatusChange={updateTaskStatus} onTaskAssigneesChange={updateTaskAssignees} onEditTask={editTask} />,
    content: <CampaignContentCalendarTab campaign={campaign} tasks={campaignTasks} schedules={linkedInfluencers} />,
    influencer: <CampaignInfluencerTab campaign={campaign} themes={campaignInfluencerThemesForCampaign(data.influencerThemes, campaign.id)} schedules={linkedInfluencers} influencers={data.influencers} canEdit={canEditInfluencers} canManagePayments={canManage && !readOnly} canDeleteThemes={canManage && !readOnly} onDeleteTheme={(id) => deleteInfluencerTheme(campaign.id, id)} onDeleteBooking={(id) => deleteInfluencerBooking(campaign.id, id)} onPaymentChange={async (id, status, amount) => { await setInfluencerBookingPayment(campaign.id, id, status, amount); notify("Status pembayaran dan riwayat spent Campaign diperbarui."); }} onBookingChange={async (id, patch) => { await saveInfluencerBooking(campaign.id, patch, id); notify("Jadwal influencer diperbarui."); }} onAddTheme={() => openDialog("influencer-theme")} onEditTheme={(theme) => { if (!canEditInfluencers) return; openDialog("influencer-theme"); setEditingTheme(theme); }} onAddBooking={() => openDialog("influencer-booking")} />,
    finance: <FinanceTab campaign={campaign} influencerSchedules={linkedInfluencers} transactionCandidates={brandTransactionCandidates} onNavigate={onNavigate} />,
    discussion: <PersistedDiscussionTab campaign={campaign} notes={campaignNotes} identity={identity} replyTo={replyTo} canEdit={canEdit} canManage={canManage} pending={notePending} onReply={setReplyTo} onCreate={async (body, reply) => { setNotePending(true); try { await createCampaignDiscussionNote(campaign.id, body, reply); setReplyTo(undefined); notify("Catatan tersimpan dan terlihat oleh anggota Campaign."); } catch (error) { notify(error instanceof Error ? error.message : "Catatan gagal disimpan."); throw error; } finally { setNotePending(false); } }} onPin={async (note, pinned) => { try { await setCampaignNoteDashboardPin(campaign.id, note.id, pinned); notify(pinned ? "Catatan dipin ke Dashboard anggota Campaign." : "Pin catatan dilepas dari Dashboard."); } catch (error) { notify(error instanceof Error ? error.message : "Pin catatan gagal diperbarui."); } }} />,
  } satisfies Record<CampaignTab, React.ReactNode>;

  return <div className="campaign-workspace">
    <button className="campaign-back-button" onClick={onBack}><Icon name="arrow-left" size={14} />Kembali ke daftar campaign</button>
    {readOnly && <div className="campaign-archived-banner"><div><Icon name="archive" size={16} /><span><strong>Campaign ini telah diarsipkan.</strong> Detail tetap tersedia dalam mode baca saja.</span></div>{canManage && <button className="button button-soft button-sm" onClick={() => onLifecycleAction?.("unarchive")}><Icon name="restore" size={13} />Buka Arsip</button>}</div>}

    <header className="campaign-detail-header">
      <div>
        <div className="campaign-detail-title"><h1>{campaign.name}</h1><StatusPill status={campaign.status} /></div>
        <p>{campaign.brand}<span>•</span>{campaignPeriodLabel(campaign)}</p>
      </div>
      <div className="campaign-detail-actions">{canEditCampaign && <button className="button button-primary" onClick={() => openDialog("info")}><Icon name="edit" size={14} />Edit informasi</button>}{canManage && <div className="campaign-action-wrap"><button className="icon-button" onClick={() => setLifecycleMenuOpen(!lifecycleMenuOpen)} aria-label="Aksi lifecycle campaign"><Icon name="more-horizontal" /></button>{lifecycleMenuOpen && <div className="campaign-action-menu detail">{readOnly ? <button onClick={() => onLifecycleAction?.("unarchive")}><Icon name="restore" size={14} />Buka Arsip</button> : <button onClick={() => onLifecycleAction?.("archive")}><Icon name="archive" size={14} />Arsipkan Campaign</button>}<button className="danger" onClick={() => { if (window.confirm(`Pindahkan ${campaign.name} ke daftar Dihapus?`)) onLifecycleAction?.("trash"); }}><Icon name="trash" size={14} />Hapus Campaign</button></div>}</div>}</div>
    </header>

    <nav className="campaign-tabs" role="tablist" aria-label="Detail campaign">
      {tabs.map((tab, index) => <button type="button" role="tab" id={`campaign-tab-${tab.id}`} aria-controls="campaign-tab-panel" aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} className={activeTab === tab.id ? "active" : ""} key={tab.id} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => handleTabKeyDown(event, index)}><Icon name={tab.icon} size={14} />{tab.label}{tab.id === "discussion" && campaignNotes.length > 0 && <span>{campaignNotes.length}</span>}</button>)}
    </nav>

    <div className="campaign-tab-panel" role="tabpanel" id="campaign-tab-panel" aria-labelledby={`campaign-tab-${activeTab}`}>{tabContent[activeTab]}</div>

    {dialog && <CampaignDialog key={`${dialog}-${editingPhase?.id || "new"}`} editingPhase={editingPhase} pending={dialogPending} type={dialog} campaign={campaign} data={data} presentation={presentation} editingTheme={editingTheme} campaignMemberIds={campaignMemberSelection(data, campaign)} error={dialogError} onClose={closeDialog} onSubmit={submitDialog} onUploadImage={dialog === "reference" ? uploadReferenceImage : undefined} onUploadCampaignAvatar={dialog === "info" ? uploadCampaignAvatar : undefined} />}
  </div>;
}


function BriefPromoTab({ campaign, presentation, canEdit, referenceSync, onEditBrief, onAddPromo, onAddReference }: { campaign: Campaign; presentation: PresentationState; canEdit: boolean; referenceSync: "idle" | "loading" | "error"; onEditBrief: () => void; onAddPromo: () => void; onAddReference: () => void }) {
  const hasBrief = Boolean(presentation.bigMessage || presentation.intro || presentation.tagline);
  const hasStoredKpi = Boolean(campaign.kpi && campaign.kpi !== "Belum ditentukan");
  return <div className="campaign-tab-stack">
    <div className="campaign-section-intro"><div><h2>Brief campaign</h2><p>Susun konteks campaign agar tim dapat bekerja tanpa instruksi yang tersebar.</p></div></div>
    <div className="campaign-brief-grid">
      <div className="campaign-tab-stack">
        <section className="card">
          <CampaignSectionHeader icon="book" title="Brief utama" action={canEdit ? <button className="button button-soft button-sm" onClick={onEditBrief}><Icon name="edit" size={12} />{hasBrief ? "Edit brief" : "Lengkapi brief"}</button> : undefined} />
          {hasBrief ? <div className="campaign-brief-content"><div className="campaign-subheading">TAGLINE</div><h3>{presentation.tagline || "Belum ditentukan"}</h3><div className="campaign-subheading">BIG MESSAGE</div><h4>{presentation.bigMessage}</h4><div className="campaign-subheading">INTRO / GAMBARAN UMUM</div><p>{presentation.intro || "Belum dilengkapi."}</p><div className="campaign-divider" /><div className="campaign-subheading">ALUR PENGERJAAN</div>{presentation.steps.length ? presentation.steps.map((step, index) => <div className="campaign-step" key={`${step}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{step}</p></div>) : <p className="campaign-muted-copy">Langkah pengerjaan belum disusun.</p>}</div> : <EmptyCampaignState icon="book" title="Brief utama belum lengkap" description={hasStoredKpi ? `Target existing “${campaign.kpi}” tetap tersedia, tetapi belum ada tagline, big message, atau gambaran umum.` : "Belum ada tagline, big message, gambaran umum, maupun target KPI."} action={canEdit ? <button className="button button-primary button-sm" onClick={onEditBrief}><Icon name="plus" size={12} />Tulis brief</button> : undefined} />}
        </section>
        <section className="card">
        <CampaignSectionHeader icon="image" title="Referensi kreatif" description="Link gambar, moodboard, atau dokumen acuan." action={canEdit ? <button className="button button-soft button-sm" onClick={onAddReference}><Icon name="plus" size={12} />Tambah referensi</button> : undefined} />
        {referenceSync === "loading" && <IntegrationNotice>Memuat referensi tersimpan…</IntegrationNotice>}
        {referenceSync === "error" && <IntegrationNotice tone="amber">Referensi tersimpan belum dapat dimuat. Pastikan migration Campaign Reference sudah dijalankan.</IntegrationNotice>}
          {presentation.references.length ? <div className="campaign-reference-grid">{presentation.references.map((reference) => <CreativeReferenceCard key={reference.id} reference={reference} />)}</div> : <EmptyCampaignState icon="image" title="Belum ada referensi" description="Tambahkan tautan moodboard atau dokumen agar eksekusi kreatif lebih konsisten." />}
        </section>
        <section className="card">
          <CampaignSectionHeader icon="pin" title="Catatan instruksi penting" />
          {presentation.instructions ? <div className="campaign-important-note"><Icon name="alert" size={15} /><p>{presentation.instructions}</p></div> : <EmptyCampaignState icon="pin" title="Belum ada instruksi khusus" description="Gunakan bagian ini untuk syarat promo, batasan copy, atau detail yang wajib dikonfirmasi." />}
        </section>
      </div>

      <aside className="card campaign-promo-column">
        <CampaignSectionHeader icon="campaign" title="Promo & mekanisme" description="Periode, manfaat, kuota, syarat, dan status persetujuan." action={canEdit ? <button className="button button-primary button-sm" onClick={onAddPromo}><Icon name="plus" size={12} />Tambah promo</button> : undefined} />
        {presentation.promos.length ? presentation.promos.map((promo) => <PromoCard key={promo.id} promo={promo} />) : <EmptyCampaignState icon="campaign" title="Belum ada promo terstruktur" description="Tambahkan draf promo untuk mereview periode dan mekanismenya." />}
      </aside>
    </div>
  </div>;
}

function TimelineTasksTab({ campaign, today, onEditPhase, phasePending, tasks, users, identity, readOnly, presentation, selectedPhaseId, taskView, canEdit, onTaskView, onSelectPhase, onAssignTaskPhase, onTogglePhaseMode, onAddPhase, onAddTask, onToggleTask, onTaskStatusChange, onTaskAssigneesChange, onEditTask }: { campaign: Campaign; today: string; onEditPhase: (phase: CampaignPhase) => void; phasePending: boolean; identity?: UserIdentity; readOnly: boolean; onEditTask: (id: EntityId) => void; tasks: Task[]; users: AppData["users"]; presentation: PresentationState; selectedPhaseId: string; taskView: "mine" | "all"; canEdit: boolean; onTaskView: (view: "mine" | "all") => void; onSelectPhase: (id: string) => void; onAssignTaskPhase: (taskId: EntityId, phaseId: string) => void; onTogglePhaseMode: () => void; onAddPhase: () => void; onAddTask: () => void; onToggleTask: (id: EntityId) => void; onTaskStatusChange: (taskId: EntityId, status: Task["status"]) => void; onTaskAssigneesChange: (taskId: EntityId, assigneeIds: string[]) => void }) {
  const selectedPhase = presentation.phases.find((phase) => phase.id === selectedPhaseId);
  const visibleTasks = tasks.filter((task) =>
    (!presentation.phaseMode || (Boolean(selectedPhase) && presentation.taskPhase[entityKey(task.id)] === selectedPhaseId)) &&
    (taskView === "all" || isTaskAssignee(task, users, identity))
  );
  const taskFilters = <div className="campaign-segmented" role="group" aria-label="Filter pekerjaan"><button type="button" className={taskView === "mine" ? "active" : ""} aria-pressed={taskView === "mine"} onClick={() => onTaskView("mine")}>Tugas saya</button><button type="button" className={taskView === "all" ? "active" : ""} aria-pressed={taskView === "all"} onClick={() => onTaskView("all")}>Semua</button></div>;
  const emptyTasks = <EmptyCampaignState icon="check-square" title={taskView === "mine" ? (presentation.phaseMode ? "Tidak ada tugas untuk Anda pada fase ini" : "Tidak ada tugas campaign untuk Anda") : (presentation.phaseMode ? "Belum ada tugas pada fase ini" : "Belum ada tugas campaign")} description={taskView === "mine" ? "Tugas yang mencantumkan Anda sebagai PIC akan tampil di sini." : "Tambahkan tugas baru untuk campaign ini."} action={canEdit ? <button className="button button-soft button-sm" onClick={onAddTask}><Icon name="plus" size={12} />Tambah tugas</button> : undefined} />;
  return <div className="campaign-tab-stack">
    {canEdit && <div className="campaign-detail-actions campaign-timeline-actions"><button className="button button-soft" onClick={onTogglePhaseMode} disabled={phasePending}><Icon name="layers" size={14} />{presentation.phaseMode ? "Gunakan tanpa fase" : "Aktifkan fase"}</button><button className="button button-primary" onClick={onAddTask}><Icon name="plus" size={14} />Tambah tugas</button></div>}

    {presentation.phaseMode ? <div className="campaign-phase-layout">
      <aside className="card campaign-phase-sidebar">
        <CampaignSectionHeader icon="calendar" title="Fase campaign" action={canEdit ? <button className="icon-button" onClick={onAddPhase} aria-label="Tambah fase"><Icon name="plus" size={15} /></button> : undefined} />
        {presentation.phases.length ? presentation.phases.map((phase, index) => <PhaseCard today={today} onEdit={canEdit ? () => onEditPhase(phase) : undefined} key={phase.id} phase={phase} index={index} selected={phase.id === selectedPhaseId} taskCount={tasks.filter((task) => presentation.taskPhase[entityKey(task.id)] === phase.id).length} onSelect={() => onSelectPhase(phase.id)} />) : <EmptyCampaignState icon="layers" title="Belum ada fase" description="Tambahkan fase pertama atau kembali gunakan daftar tugas tanpa fase." action={canEdit ? <button className="button button-soft button-sm" onClick={onAddPhase}><Icon name="plus" size={12} />Tambah fase</button> : undefined} />}
      </aside>
      <section className="card campaign-phase-tasks">
        <CampaignSectionHeader icon="check-square" title="Daftar pekerjaan" action={taskFilters} />
        {selectedPhase && <div className="campaign-phase-summary"><h3>{selectedPhase.name}</h3><span>{phasePeriodLabel(selectedPhase)} · {phaseTimeState(selectedPhase, today)}</span><p>{selectedPhase.purpose}</p></div>}
        {!selectedPhase ? <EmptyCampaignState icon="layers" title="Pilih atau buat fase" description="Tugas akan muncul setelah sebuah fase dipilih." /> : visibleTasks.length ? visibleTasks.map((task) => <CampaignTaskRow campaign={campaign} identity={identity} onEdit={() => onEditTask(task.id)} key={task.id} task={task} users={users} phaseName={selectedPhase.name} phaseOptions={presentation.phases} phaseId={presentation.taskPhase[entityKey(task.id)] || ""} onPhaseChange={(phaseId) => onAssignTaskPhase(task.id, phaseId)} onAssigneesChange={(ids) => onTaskAssigneesChange(task.id, ids)} onStatusChange={(status) => onTaskStatusChange(task.id, status)} readOnly={readOnly} onToggle={() => onToggleTask(task.id)} />) : emptyTasks}
      </section>
    </div> : <section className="card">
      <CampaignSectionHeader icon="check-square" title="Daftar pekerjaan" action={taskFilters} />
      {visibleTasks.length ? visibleTasks.map((task) => <CampaignTaskRow campaign={campaign} identity={identity} onEdit={() => onEditTask(task.id)} key={task.id} task={task} users={users} onAssigneesChange={(ids) => onTaskAssigneesChange(task.id, ids)} onStatusChange={(status) => onTaskStatusChange(task.id, status)} readOnly={readOnly} onToggle={() => onToggleTask(task.id)} />) : emptyTasks}
    </section>}
  </div>;
}

function calendarDateLabel(value: string) {
  return formatDisplayDate(value);
}

function calendarEventClass(event: CampaignCalendarEvent) {
  if (event.type === "influencer_upload") return "influencer";
  return event.type === "reels" ? "reels" : "feed";
}

function CampaignContentCalendarTab({ campaign, tasks, schedules }: { campaign: Campaign; tasks: Task[]; schedules: AppData["influencerSchedules"] }) {
  const initialDate = new Date();
  const [month, setMonth] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const [filter, setFilter] = useState<"all" | "production" | "influencer">("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const allEvents = useMemo(() => campaignCalendarEvents(campaign, tasks, schedules), [campaign, schedules, tasks]);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}-`;
  const events = allEvents.filter((event) => event.date.startsWith(monthPrefix) && (filter === "all" || (filter === "production" ? event.type !== "influencer_upload" : event.type === "influencer_upload")));
  const eventsByDate = new Map<string, CampaignCalendarEvent[]>();
  for (const event of events) eventsByDate.set(event.date, [...(eventsByDate.get(event.date) || []), event]);
  const cells = calendarMonthCells(year, monthIndex);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const selectedEvents = selectedDate ? eventsByDate.get(selectedDate) || [] : [];
  const changeMonth = (delta: number) => { setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1)); setSelectedDate(null); };
  const goToToday = () => { setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedDate(today); };

  return <div className="campaign-calendar-tab">
    <section className="card campaign-calendar-card">
      <header className="campaign-calendar-header"><div><h2>{calendarMonthTitle(year, monthIndex)}</h2><p>{events.length} jadwal dalam campaign ini</p></div><div className="campaign-calendar-controls"><button className="button button-soft button-sm" onClick={goToToday}>Hari ini</button><button className="icon-button" aria-label="Bulan sebelumnya" onClick={() => changeMonth(-1)}><Icon name="chevron-left" size={16} /></button><button className="icon-button" aria-label="Bulan berikutnya" onClick={() => changeMonth(1)}><Icon name="chevron-right" size={16} /></button></div></header>
      <div className="campaign-calendar-toolbar"><div className="campaign-segmented" role="group" aria-label="Filter jadwal"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Semua</button><button className={filter === "production" ? "active" : ""} onClick={() => setFilter("production")}>Official</button><button className={filter === "influencer" ? "active" : ""} onClick={() => setFilter("influencer")}>Influencer</button></div><div className="campaign-calendar-legend"><span><i className="feed" />Feed / Carousel</span><span><i className="reels" />Reels</span><span><i className="influencer" />Influencer</span></div></div>
      <div className="campaign-calendar-weekdays" aria-hidden="true">{["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="campaign-calendar-grid" role="grid" aria-label={`Jadwal campaign ${calendarMonthTitle(year, monthIndex)}`}>
        {cells.map((cell) => {
          const dayEvents = eventsByDate.get(cell.dateKey) || [];
          const selected = selectedDate === cell.dateKey;
          return <button type="button" role="gridcell" aria-selected={selected} aria-label={`${calendarDateLabel(cell.dateKey)}${dayEvents.length ? `, ${dayEvents.length} jadwal` : ", tidak ada jadwal"}`} className={`campaign-calendar-day ${cell.inMonth ? "" : "outside"} ${cell.dateKey === today ? "today" : ""} ${selected ? "selected" : ""}`} key={cell.dateKey} onClick={() => setSelectedDate(cell.dateKey)}>
            <span className="campaign-calendar-day-number">{cell.day}</span><span className="campaign-calendar-day-events">{dayEvents.slice(0, 2).map((event) => <span title={`${event.subtitle}: ${event.title}`} className={`campaign-calendar-event ${calendarEventClass(event)} ${event.status === "Done" || event.status === "Selesai" ? "done" : ""}`} key={event.id}>{event.title}</span>)}{dayEvents.length > 2 && <span className="campaign-calendar-more">+{dayEvents.length - 2} lainnya</span>}</span>
          </button>;
        })}
      </div>
      {events.length === 0 && <div className="campaign-calendar-empty"><Icon name="calendar" size={20} /><strong>Belum ada jadwal bulan ini</strong><span>Tugas Feed/Carousel atau Reels dengan deadline, serta jadwal publikasi influencer, akan tampil di sini.</span></div>}
      <div className="campaign-calendar-agenda" aria-label="Agenda campaign bulan ini">
        {events.length ? events.map((event) => <article className={`campaign-calendar-agenda-item ${calendarEventClass(event)} ${event.status === "Done" || event.status === "Selesai" ? "done" : ""}`} key={event.id}><time dateTime={event.date}>{calendarDateLabel(event.date)}</time><span className="campaign-calendar-agenda-copy"><strong>{event.title}</strong><small>{event.subtitle}</small></span><StatusPill status={displayInfluencerBookingStatus(event.status)} /></article>) : <p>Belum ada jadwal pada bulan ini.</p>}
      </div>
    </section>
    {selectedDate && <section className="card campaign-calendar-day-details"><header><div><h3>{calendarDateLabel(selectedDate)}</h3><p>{selectedEvents.length} jadwal pada tanggal ini</p></div></header>{selectedEvents.length ? selectedEvents.map((event) => <article className={`campaign-calendar-agenda-item ${calendarEventClass(event)} ${event.status === "Done" || event.status === "Selesai" ? "done" : ""}`} key={event.id}><span className="campaign-calendar-agenda-copy"><strong>{event.title}</strong><small>{event.subtitle}</small></span><StatusPill status={displayInfluencerBookingStatus(event.status)} /></article>) : <div className="campaign-calendar-empty compact"><span>Tidak ada jadwal pada tanggal ini.</span></div>}</section>}
  </div>;
}
function FinanceTab({ campaign, influencerSchedules, transactionCandidates, onNavigate }: { campaign: Campaign; influencerSchedules: AppData["influencerSchedules"]; transactionCandidates: AppData["transactions"]; onNavigate: (view: string) => void }) {
  const budget = Math.max(campaign.budget, 0);
  const spent = Math.max(campaign.spent, 0);
  const remaining = Math.max(budget - spent, 0);
  const scheduledInfluencerSpent = influencerSchedules.reduce((total, item) => total + Math.max(item.spent, 0), 0);
  const influencerSpent = Math.min(spent, scheduledInfluencerSpent);
  const hasSpendMismatch = scheduledInfluencerSpent > spent;
  const otherSpent = Math.max(spent - influencerSpent, 0);
  const categories = [
    { key: "unused", label: "Belum terpakai", amount: remaining, color: "#d8dee8", note: "Sisa dari total anggaran" },
    { key: "influencer", label: "Influencer", amount: influencerSpent, color: "#7357df", note: "Spent pada jadwal influencer" },
    { key: "ads", label: "Ads", amount: 0, color: "#39a58a", note: "Transaksi belum tertaut" },
    { key: "other", label: "Lainnya", amount: otherSpent, color: "#e9a23b", note: otherSpent ? "Realisasi belum dirinci per kategori" : "Belum ada realisasi tertaut" },
  ];
  const circumference = 2 * Math.PI * 74;
  let dashOffset = 0;
  const history = influencerSchedules.filter((item) => item.spent > 0).sort((a, b) => (b.uploadDate || b.date || "").localeCompare(a.uploadDate || a.date || ""));
  return <div className="campaign-tab-stack campaign-finance-dashboard">
    <div className="campaign-section-intro"><div><h2>Keuangan campaign</h2><p>Pantau penggunaan budget dan pengeluaran yang tercatat di campaign ini.</p></div><button className="button button-primary" onClick={() => onNavigate("partners")}><Icon name="external" size={14} />Buka Mitra & Keuangan</button></div>
    <section className="card campaign-finance-summary">
      <header className="campaign-finance-summary-head"><div><h3>Penggunaan anggaran</h3><p>Realisasi mengacu pada Campaign; rincian influencer berasal dari jadwal yang terhubung.</p></div></header>
      <div className="campaign-finance-chart-layout">
        <div className="campaign-finance-donut-wrap">
          <svg className="campaign-finance-donut" viewBox="0 0 200 200" role="img" aria-label={`Realisasi ${rupiah(spent)} dari anggaran ${rupiah(budget)}`}>
            <circle className="campaign-finance-donut-track" cx="100" cy="100" r="74" />
            {budget > 0 && categories.filter((category) => category.amount > 0).map((category) => {
              const length = circumference * (category.amount / budget);
              const circle = <circle key={category.key} cx="100" cy="100" r="74" fill="none" stroke={category.color} strokeWidth="25" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-dashOffset} />;
              dashOffset += length;
              return circle;
            })}
            <text className="campaign-finance-donut-value" x="100" y="95" textAnchor="middle">{rupiah(spent)}</text>
            <text className="campaign-finance-donut-label" x="100" y="117" textAnchor="middle">sudah terealisasi</text>
          </svg>
        </div>
        <div className="campaign-finance-legend" aria-label="Rincian penggunaan budget">
          {categories.map((category) => <div className="campaign-finance-category" key={category.key}><span className="campaign-finance-category-name"><i style={{ backgroundColor: category.color }} /><span><strong>{category.label}</strong><small>{category.note}</small></span></span><strong className="campaign-finance-category-value">{category.key === "ads" ? "Belum tertaut" : rupiah(category.amount)}</strong></div>)}
        </div>
      </div>
      {!budget && <div className="campaign-finance-unset"><Icon name="info" size={15} /><span>Anggaran belum ditentukan. Atur budget agar diagram penggunaan dapat dihitung.</span></div>}
      {transactionCandidates.length > 0 && <p className="campaign-finance-data-note">Transaksi {campaign.brand} belum dihubungkan ke campaign, jadi tidak dihitung pada diagram ini.</p>}
      {hasSpendMismatch && <p className="campaign-finance-data-note">Spent jadwal influencer melebihi nilai realisasi Campaign. Nilai pada diagram dibatasi agar totalnya tetap konsisten; periksa kembali pencatatan keuangan.</p>}
    </section>
    <section className="campaign-finance-metrics" aria-label="Ringkasan anggaran campaign">
      <article className="card campaign-finance-metric"><span>Total anggaran</span><strong>{rupiah(budget)}</strong><Icon name="wallet" size={17} /></article>
      <article className="card campaign-finance-metric realized"><span>Realisasi</span><strong>{rupiah(spent)}</strong><Icon name="chart" size={17} /></article>
      <article className="card campaign-finance-metric remaining"><span>Sisa anggaran</span><strong>{rupiah(remaining)}</strong><Icon name="target" size={17} /></article>
    </section>
    <section className="card campaign-finance-history">
      <CampaignSectionHeader icon="wallet" title="Riwayat spent" description="Pengeluaran influencer dari jadwal yang terhubung ke campaign." />
      {history.length ? <div className="campaign-finance-history-list">{history.map((item) => <article className="campaign-finance-history-row" key={String(item.id)}><span className="campaign-finance-history-icon"><Icon name="users" size={16} /></span><span className="campaign-finance-history-copy"><strong>{item.influencer}</strong><small>{item.themeName || item.content || item.platform}</small><StatusPill status={displayInfluencerPaymentStatus(item.paymentStatus)} className={`campaign-influencer-status-pill payment-${influencerPaymentStatusTone(item.paymentStatus)}`} /></span><strong className="campaign-finance-history-amount">{rupiah(item.spent)}</strong></article>)}</div> : <EmptyCampaignState icon="wallet" title="Belum ada riwayat spent" description="Spent influencer yang terhubung ke campaign akan tampil di sini." action={<button className="button button-soft button-sm" onClick={() => onNavigate("partners")}><Icon name="external" size={13} />Buka Mitra & Keuangan</button>} />}
      {otherSpent > 0 && <IntegrationNotice tone="amber">Sebagian realisasi belum memiliki rincian transaksi per kategori. Hubungkan transaksi ke campaign untuk membedakan Ads dan pengeluaran lainnya secara akurat.</IntegrationNotice>}
    </section>
  </div>;
}

function PersistedDiscussionTab({ campaign, notes, identity, replyTo, canEdit, canManage, pending, onReply, onCreate, onPin }: { campaign: Campaign; notes: CampaignDiscussionNote[]; identity?: UserIdentity; replyTo?: string; canEdit: boolean; canManage: boolean; pending: boolean; onReply: (id?: string) => void; onCreate: (body: string, replyTo?: string) => Promise<void>; onPin: (note: CampaignDiscussionNote, pinned: boolean) => void }) {
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("message") || "").trim();
    if (!canEdit || !body || pending) return;
    try { await onCreate(body, replyTo); form.reset(); } catch { /* Parent reports persistence errors. */ }
  };
  const pinned = notes.filter((note) => note.pinnedToDashboard);
  return <div className="campaign-tab-stack">
    <div className="campaign-section-intro"><div><h2>Diskusi & catatan campaign</h2><p>Bagikan keputusan dan informasi yang perlu diketahui bersama.</p></div></div>
    <div className="campaign-discussion-grid">
      <section className="card campaign-discussion-main">
        <CampaignSectionHeader icon="message" title="Ruang diskusi" description={`${notes.length} catatan`} />
        <div className="campaign-note-list">{notes.length ? notes.map((note) => <CampaignNote key={note.id} note={{ id: note.id, author: note.authorName, body: note.body, createdAt: note.createdAt, pinned: note.pinnedToDashboard, replyTo: note.replyTo || undefined }} readOnly={!canEdit} canPin={canEdit && (canManage || String(note.authorId) === String(identity?.id ?? identity?.username))} onReply={() => onReply(note.id)} onPin={() => onPin(note, !note.pinnedToDashboard)} />) : <EmptyCampaignState icon="message" title="Belum ada diskusi" description="Mulai dengan pertanyaan, keputusan, atau update pekerjaan yang perlu diketahui tim." />}</div>
        <div className="campaign-divider" />
        <form onSubmit={send} className="campaign-note-form">
          <div className="campaign-card-row"><strong>{replyTo ? "Tulis balasan" : "Tulis catatan"}</strong>{replyTo && <button type="button" onClick={() => onReply(undefined)}>Batalkan balasan ×</button>}</div>
          <textarea className="textarea" name="message" required maxLength={4000} disabled={!canEdit || pending} placeholder={canEdit ? "Tulis masukan, pertanyaan, keputusan, atau update pekerjaan..." : "Akun ini memiliki akses baca saja."} onKeyDown={(event) => { if (event.ctrlKey && event.key === "Enter") event.currentTarget.form?.requestSubmit(); }} />
          <div className="campaign-note-footer"><span>Maks. 4.000 karakter · Ctrl + Enter untuk kirim</span><button type="submit" className="button button-primary" disabled={!canEdit || pending}><Icon name="send" size={13} />{pending ? "Menyimpan…" : "Kirim catatan"}</button></div>
        </form>
      </section>
      <aside className="campaign-tab-stack"><section className="card"><CampaignSectionHeader icon="pin" title="Catatan penting" description="Catatan yang dipin akan tampil di Dashboard anggota Campaign." />{pinned.length ? pinned.map((note) => <div className="campaign-pinned-note" key={note.id}><strong>{note.authorName}</strong><p>{note.body}</p><small>{formatDisplayDateTime(note.createdAt)}</small></div>) : <EmptyCampaignState icon="pin" title="Belum ada catatan penting" description="Pin catatan diskusi agar mudah ditemukan anggota campaign di Dashboard." />}</section></aside>
    </div>
    <span className="sr-only">Campaign: {campaign.name}</span>
  </div>;
}

function CampaignDialog({ editingPhase, pending = false, type, campaign, data, presentation, editingTheme, campaignMemberIds, error, onClose, onSubmit, onUploadImage, onUploadCampaignAvatar }: { editingPhase?: CampaignPhase | null; pending?: boolean; type: CampaignDialogType; campaign: Campaign; data: AppData; presentation: PresentationState; editingTheme: CampaignInfluencerTheme | null; campaignMemberIds: string[]; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onUploadImage?: (file: File) => Promise<string>; onUploadCampaignAvatar?: (file: File) => Promise<string> }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const blockedRef = useRef(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [phaseStart, setPhaseStart] = useState(editingPhase?.startDate || "");
  const [phaseEnd, setPhaseEnd] = useState(editingPhase?.endDate || "");
  const today = useJakartaToday();
  const [pasteStatus, setPasteStatus] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(campaign.avatarUrl || "");
  const [avatarUploadError, setAvatarUploadError] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  blockedRef.current = uploadingAvatar || pending;
  const brandLogo = data.brands.find((brand) => String(brand.id) === String(campaign.brandId) || brand.name === campaign.brand)?.logoUrl;
  const campaignPhaseNames = Array.from(new Set(orderedPhases(campaign.timelineConfig?.phases || []).map((phase) => phase.name.trim()).filter(Boolean)));
  const hasLegacyThemePhase = Boolean(editingTheme?.phase && !campaignPhaseNames.includes(editingTheme.phase));
  const info: Record<CampaignDialogType, { title: string; description: string }> = {
    info: { title: "Edit informasi Campaign", description: "Perbarui informasi dasar, foto campaign, dan periode." },
    brief: { title: "Lengkapi brief campaign", description: "Simpan brief agar dapat dibaca seluruh tim Campaign." },
    promo: { title: "Tambah promo", description: "Lengkapi periode dan mekanisme agar tidak menimbulkan interpretasi berbeda." },
    phase: { title: editingPhase ? "Edit fase" : "Tambah fase", description: "Pilih tanggal inklusif. Fase berikutnya dimulai setelah fase sebelumnya berakhir." },
    reference: { title: "Tambah referensi kreatif", description: "Gunakan URL gambar, moodboard, atau dokumen acuan." },
    "influencer-theme": { title: editingTheme ? "Edit tema konten" : "Tambah tema konten", description: "Tema ini tersimpan khusus pada campaign ini dan dapat dipilih untuk jadwal influencer." },
    "influencer-booking": { title: "Tambah jadwal influencer", description: "Pilih influencer master, tema campaign, dan tanggal visit serta upload." },
  };

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialogNode = dialogRef.current;
    dialogNode?.querySelector<HTMLElement>("input:not([disabled]):not([type='hidden']):not([type='file']), textarea:not([disabled]), select:not([disabled])")?.focus();
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        if (blockedRef.current) return;
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogNode) return;
      const focusable = Array.from(dialogNode.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]):not([type="hidden"]):not([type="file"]), textarea:not([disabled]), select:not([disabled]), a[href]'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  const handlePaste = async (event: ClipboardEvent<HTMLFormElement>) => {
    if (type !== "reference") return;
    const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    event.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    if (!onUploadImage) {
      setPasteStatus("Hubungkan Supabase terlebih dahulu untuk mengunggah gambar dari clipboard.");
      return;
    }
    setPasteStatus("Mengunggah gambar dari clipboard…");
    try {
      const url = await onUploadImage(file);
      const form = event.currentTarget;
      const urlInput = form.elements.namedItem("url") as HTMLInputElement | null;
      const kindInput = form.elements.namedItem("kind") as HTMLSelectElement | null;
      const mimeInput = form.elements.namedItem("mimeType") as HTMLInputElement | null;
      if (urlInput) urlInput.value = url;
      if (kindInput) kindInput.value = "Gambar";
      if (mimeInput) mimeInput.value = file.type;
      setPasteStatus("Gambar siap disimpan. Lengkapi judul dan periode, lalu simpan.");
    } catch (uploadError) {
      setPasteStatus(uploadError instanceof Error ? uploadError.message : "Upload gambar gagal.");
    }
  };

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setAvatarUploadError("Pilih file gambar untuk foto Campaign.");
    if (file.size > 5 * 1024 * 1024) return setAvatarUploadError("Ukuran foto maksimal 5 MB.");
    if (!onUploadCampaignAvatar) return setAvatarUploadError("Unggah foto memerlukan koneksi Supabase aktif.");
    setAvatarUploadError("");
    setUploadingAvatar(true);
    try {
      setAvatarUrl(await onUploadCampaignAvatar(file));
    } catch (uploadError) {
      setAvatarUploadError(uploadError instanceof Error ? uploadError.message : "Upload foto Campaign gagal.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !uploadingAvatar && !pending) onClose(); }}>
    <section ref={dialogRef} className="modal campaign-detail-modal" role="dialog" aria-modal="true" aria-labelledby="campaign-dialog-title" aria-describedby="campaign-dialog-description">
      <div className="modal-head"><div><h2 id="campaign-dialog-title">{info[type].title}</h2><p id="campaign-dialog-description">{info[type].description}</p></div><button type="button" className="icon-button modal-close" onClick={onClose} aria-label="Tutup" disabled={uploadingAvatar || pending}><Icon name="close" /></button></div>
      <form onSubmit={(event) => { if (uploadingAvatar || pending) { event.preventDefault(); setAvatarUploadError("Tunggu sampai upload foto selesai."); return; } onSubmit(event); }} onPaste={handlePaste} className="form-stack">
        {type === "info" && <><div className="campaign-avatar-editor"><CampaignAvatar src={avatarUrl || null} fallbackSrc={brandLogo} initials={campaign.brand === "HBI" ? "H" : "HB"} /><div className="campaign-avatar-editor-copy"><strong>Foto campaign</strong><span>{onUploadCampaignAvatar ? "Gunakan foto khusus atau logo brand sebagai tampilan default." : "Hubungkan Supabase untuk mengunggah foto; logo brand tetap digunakan sebagai tampilan default."}</span><div><input ref={avatarInputRef} className="campaign-avatar-file" type="file" accept="image/*" aria-label="Pilih foto campaign" onChange={handleAvatarChange} /><button type="button" className="button button-soft button-sm" onClick={() => avatarInputRef.current?.click()} disabled={!onUploadCampaignAvatar || uploadingAvatar}><Icon name="image" size={13} />{uploadingAvatar ? "Mengunggah…" : "Ganti foto"}</button>{avatarUrl && <button type="button" className="button button-ghost button-sm" onClick={() => { setAvatarUrl(""); setAvatarUploadError(""); }} disabled={uploadingAvatar || pending}>Gunakan logo brand</button>}</div>{avatarUploadError && <small className="campaign-avatar-error" role="alert">{avatarUploadError}</small>}</div><input type="hidden" name="avatarUrl" value={avatarUrl} readOnly /></div><Field label="Nama Campaign" name="name" required defaultValue={campaign.name} placeholder="Contoh: Grand Opening RUMA Purwokerto" /><Select label="Brand" name="brand" values={campaignBrands(data, campaign.brand)} defaultValue={campaign.brand} required /><div className="campaign-form-group"><div><strong>Periode Campaign</strong><span>Opsional, kosongkan bila belum ditentukan.</span></div><div className="two-fields"><Field label="Tanggal mulai" name="startDate" type="date" defaultValue={campaign.startDate || ""} /><Field label="Tanggal selesai" name="endDate" type="date" defaultValue={campaign.endDate || ""} min={campaign.startDate || undefined} /></div></div><TextArea label="Tujuan Singkat" name="objective" defaultValue={campaign.objective} placeholder="Apa tujuan utama campaign ini?" /><fieldset className="campaign-members-field"><legend>Anggota Campaign</legend><p>Anggota yang dipilih dapat melihat campaign dan catatan yang dipin di Dashboard. PIC tugas tetap diatur pada masing-masing tugas.</p><div className="campaign-members-list">{data.users.filter((user) => user.status === "Aktif").map((user) => <label key={user.id ?? user.username}><input type="checkbox" name="campaignMemberIds" value={String(user.id ?? user.username)} defaultChecked={campaignMemberIds.includes(String(user.id ?? user.username))} /><Avatar name={user.name} src={user.avatarUrl} /><span>{user.name}<small>{user.role}</small></span></label>)}</div></fieldset></>}
        {type === "brief" && <><Field label="Tagline" name="tagline" defaultValue={presentation.tagline} placeholder="Contoh: Make it Machiro" /><TextArea label="Big message" name="bigMessage" required defaultValue={presentation.bigMessage} placeholder="Pesan utama yang harus dipahami audiens" /><TextArea label="Gambaran umum" name="intro" defaultValue={presentation.intro} placeholder="Latar belakang, tujuan, dan fokus komunikasi" /><TextArea label="Alur pengerjaan" name="steps" defaultValue={presentation.steps.join("\n")} placeholder="Satu langkah per baris" /><TextArea label="Instruksi penting" name="instructions" defaultValue={presentation.instructions} placeholder="Syarat promo atau hal yang wajib dikonfirmasi" /></>}
        {type === "promo" && <><Field label="Nama promo" name="title" required placeholder="Contoh: Diskon 30%" /><div className="campaign-form-group"><div><strong>Periode promo</strong><span>Pilih tanggal mulai dan selesai.</span></div><div className="two-fields"><Field label="Tanggal mulai" name="startDate" type="date" required /><Field label="Tanggal selesai" name="endDate" type="date" required /></div></div><TextArea label="Mekanisme & syarat" name="detail" placeholder="Kuota, eligibility, cara klaim, dan batasan (opsional)" /><div className="campaign-form-hint">Promo baru akan dibuat sebagai <strong>Draft</strong>. Status dapat diatur melalui aksi promo setelah workflow backend tersedia.</div></>}
        {type === "phase" && <><Field label="Nama fase" name="name" required defaultValue={editingPhase?.name} placeholder="Contoh: Teaser" /><div className="two-fields"><label className="form-field">Tanggal mulai *<input className="modal-input" aria-label="Tanggal mulai fase" type="date" name="startDate" required value={phaseStart} min={campaign.startDate || undefined} max={campaign.endDate || undefined} onChange={(event) => setPhaseStart(event.target.value)} /></label><label className="form-field">Tanggal selesai *<input className="modal-input" aria-label="Tanggal selesai fase" type="date" name="endDate" required value={phaseEnd} min={phaseStart || campaign.startDate || undefined} max={campaign.endDate || undefined} onChange={(event) => setPhaseEnd(event.target.value)} /></label></div><TextArea label="Tujuan fase" name="purpose" defaultValue={editingPhase?.purpose} placeholder="Apa yang harus dicapai pada fase ini?" /><div className="campaign-form-hint" aria-live="polite">{datedPhase({ startDate: phaseStart, endDate: phaseEnd } as CampaignPhase) ? phaseTimeState({ startDate: phaseStart, endDate: phaseEnd } as CampaignPhase, today) : "Keadaan waktu dihitung otomatis setelah tanggal diisi."}</div></>}
        {type === "reference" && <><Field label="Judul referensi" name="title" required placeholder="Contoh: Moodboard visual" /><div className="campaign-form-group"><div><strong>Periode referensi</strong><span>Gunakan periode saat referensi dipakai dalam campaign.</span></div><div className="two-fields"><Field label="Tanggal mulai" name="startDate" type="date" required /><Field label="Tanggal selesai" name="endDate" type="date" required /></div></div><Field label="URL" name="url" required type="url" placeholder="https://..." /><Select label="Jenis" name="kind" values={["Link", "Gambar", "Dokumen"]} /><input type="hidden" name="mimeType" /><div className="campaign-reference-paste-note"><Icon name="image" size={16} /><span><strong>Tempel gambar langsung</strong><br />Salin gambar, lalu tekan Ctrl + V di form ini. {pasteStatus && <em>{pasteStatus}</em>}</span></div></>}
        {type === "influencer-theme" && <><div className="two-fields"><Field label="Kode tema" name="themeCodePreview" readOnly defaultValue={editingTheme?.code || nextCampaignInfluencerThemeCode(data.influencerThemes, campaign.id)} /><Field label="Nama tema" name="name" required defaultValue={editingTheme?.name} placeholder="Contoh: Menu Baru" /></div><div className="two-fields"><div className="form-field"><label htmlFor="campaign-field-phase">Fase</label><select id="campaign-field-phase" className="modal-input" name="phase" defaultValue={editingTheme?.phase || ""}><option value="">Tanpa fase</option>{hasLegacyThemePhase && <option value={editingTheme!.phase}>Fase tersimpan: {editingTheme!.phase}</option>}{campaignPhaseNames.map((phase) => <option value={phase} key={phase}>{phase}</option>)}</select></div><Field label="Tujuan" name="objective" defaultValue={editingTheme?.objective} placeholder="Contoh: Alasan datang" /></div>{campaignPhaseNames.length === 0 && <div className="campaign-form-hint">Campaign ini belum memiliki fase. Tema tetap bisa dibuat tanpa fase; tambahkan fase dari tab Timeline &amp; Tugas jika diperlukan.</div>}<TextArea label="Isi wajib" name="requiredContent" defaultValue={editingTheme?.requiredContent} placeholder="Detail yang wajib disampaikan atau ditampilkan" /><TextArea label="CTA" name="cta" defaultValue={editingTheme?.cta} placeholder="Contoh: Tag teman" /></>}
        {type === "influencer-booking" && <><Select label="Influencer" name="influencerId" values={data.influencers.map((item) => String(item.id ?? item.name))} labels={data.influencers.map((item) => `${item.name} · ${item.platform}`)} required /><Select label="Tema konten" name="themeId" values={campaignInfluencerThemesForCampaign(data.influencerThemes, campaign.id).map((item) => String(item.id))} labels={campaignInfluencerThemesForCampaign(data.influencerThemes, campaign.id).map((item) => `${item.code} · ${item.name}`)} required /><div className="two-fields"><Field label="Tanggal visit" name="visitDate" type="date" /><Field label="Tanggal upload" name="uploadDate" type="date" /></div><div className="campaign-form-hint">Rate awal menggunakan rate card master influencer. Spent dimulai dari Rp0 dan status pembayaran Belum dibayar.</div></>}
        {error && <div className="campaign-form-error" role="alert"><Icon name="alert" size={14} />{error}</div>}
        <div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose} disabled={uploadingAvatar || pending}>Batal</button><button type="submit" className="button button-primary" disabled={uploadingAvatar || pending}>{uploadingAvatar ? "Mengunggah foto…" : pending ? "Menyimpan…" : "Simpan perubahan"}</button></div>
      </form>
    </section>
  </div>;
}

function Field({ label, name, required, type = "text", defaultValue, placeholder, min, step, readOnly }: { label: string; name: string; required?: boolean; type?: string; defaultValue?: string; placeholder?: string; min?: string; step?: string; readOnly?: boolean }) {
  const id = `campaign-field-${name}`;
  return <div className="form-field"><label htmlFor={id}>{label}{required ? " *" : ""}</label><input id={id} className="modal-input" name={name} type={type} required={required} defaultValue={defaultValue} placeholder={placeholder} min={min} step={step} readOnly={readOnly} /></div>;
}

function TextArea({ label, name, required, defaultValue, placeholder }: { label: string; name: string; required?: boolean; defaultValue?: string; placeholder?: string }) {
  const id = `campaign-field-${name}`;
  return <div className="form-field"><label htmlFor={id}>{label}{required ? " *" : ""}</label><textarea id={id} className="modal-input campaign-modal-textarea" name={name} required={required} maxLength={5000} defaultValue={defaultValue} placeholder={placeholder} /></div>;
}

function campaignBrands(data: AppData, currentBrand: string) {
  return Array.from(new Set([currentBrand, ...data.campaigns.map((item) => item.brand), ...data.content.map((item) => item.brand), ...data.requests.map((item) => item.brand), ...data.transactions.map((item) => item.brand)].map((brand) => brand.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right, "id"));
}

function Select({ label, name, values, labels, defaultValue, required = false }: { label: string; name: string; values: string[]; labels?: string[]; defaultValue?: string; required?: boolean }) {
  const id = `campaign-field-${name}`;
  return <div className="form-field"><label htmlFor={id}>{label}{required ? " *" : ""}</label><select id={id} className="modal-input" name={name} required={required} defaultValue={defaultValue || values[0]}>{values.map((value, index) => <option value={value} key={value}>{labels?.[index] || value}</option>)}</select></div>;
}
