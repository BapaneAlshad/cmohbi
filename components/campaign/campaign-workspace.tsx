"use client";

import { ChangeEvent, DragEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { SaveCampaign, CampaignContentConfig, CampaignSavePatch, AppData, CampaignDiscussionNote, CampaignExpense, CampaignExpenseInput, CampaignInfluencerActions, CampaignInfluencerTheme, CampaignKpiInput, CampaignTimelineConfig, EntityId, Task, TaskPatch, UserIdentity } from "@/lib/types";
import { emptyCampaignContent } from "@/lib/campaign-persistence";
import { canCreateCampaignExpense, campaignExpenseCategories, validateCampaignBudget, validateCampaignExpense } from "@/lib/campaign-finance";
import { campaignImportantNotes } from "@/lib/campaign-important-notes";
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
  PromoCard,
  PhaseCard,
} from "./campaign-primitives";

type Campaign = AppData["campaigns"][number];
type CampaignWorkspaceInfluencerActions = Omit<CampaignInfluencerActions, "saveInfluencerProfile">;
type CampaignTab = "overview" | "brief" | "timeline" | "content" | "influencer" | "finance" | "discussion";
type CampaignDialogType = "info" | "brief" | "promo" | "phase" | "reference" | "influencer-theme" | "influencer-booking";

type PresentationState = {
  tagline: string;
  bigMessage: string;
  intro: string;
  instructions: string;
  instructionsPinned: boolean;
  instructionsPinnedAt: string | null;
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
  instructionsPinned: false,
  instructionsPinnedAt: null,
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
  createCampaignExpense,
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
}: CampaignWorkspaceInfluencerActions & { saveCampaign: SaveCampaign;
  openTaskEditor: (id?: EntityId, campaignId?: EntityId) => void;
  mutateTask: (id: EntityId, patch: TaskPatch) => Promise<void>;
  saveCampaignKpi: (id: EntityId, input: CampaignKpiInput, existingId?: string) => Promise<void>;
  createCampaignExpense: (campaignId: EntityId, input: CampaignExpenseInput) => Promise<void>;
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
  return <CampaignWorkspaceContent saveCampaign={saveCampaign} saveInfluencerTheme={saveInfluencerTheme} deleteInfluencerTheme={deleteInfluencerTheme} saveInfluencerBooking={saveInfluencerBooking} deleteInfluencerBooking={deleteInfluencerBooking} setInfluencerBookingPayment={setInfluencerBookingPayment} saveCampaignMembers={saveCampaignMembers} createCampaignDiscussionNote={createCampaignDiscussionNote} setCampaignNoteDashboardPin={setCampaignNoteDashboardPin} createCampaignExpense={createCampaignExpense} initialTab={initialTab} saveCampaignTimeline={saveCampaignTimeline} openTaskEditor={openTaskEditor} mutateTask={mutateTask} saveCampaignKpi={saveCampaignKpi} liveMode={liveMode} key={campaign.id} campaign={campaign} data={data} identity={identity} readOnly={readOnly} onBack={onBack} onNavigate={onNavigate} setData={setData} notify={notify} getAccessToken={getAccessToken} uploadMedia={uploadMedia} workspaceId={workspaceId} onLifecycleAction={onLifecycleAction} />;
}

function CampaignWorkspaceSkeleton() {
  return <div className="campaign-skeleton" aria-label="Memuat detail campaign"><div className="campaign-skeleton-line wide" /><div className="campaign-skeleton-line short" /><div className="campaign-skeleton-tabs" /><div className="campaign-skeleton-grid"><div /><div /><div /></div></div>;
}

function CampaignWorkspaceContent({ saveCampaign, saveInfluencerTheme, deleteInfluencerTheme, saveInfluencerBooking, deleteInfluencerBooking, setInfluencerBookingPayment, saveCampaignMembers, createCampaignDiscussionNote, setCampaignNoteDashboardPin, createCampaignExpense, campaign, data, identity, readOnly, onBack, onNavigate, setData, notify, getAccessToken, uploadMedia, workspaceId, onLifecycleAction, mutateTask, saveCampaignKpi, saveCampaignTimeline, initialTab, liveMode, openTaskEditor }: CampaignWorkspaceInfluencerActions & { saveCampaign: SaveCampaign; saveCampaignTimeline: (id: EntityId, phaseMode: boolean, phases: CampaignPhase[], expectedVersion?: number) => Promise<void>; saveCampaignMembers: (campaignId: EntityId, memberIds: EntityId[]) => Promise<void>; createCampaignDiscussionNote: (campaignId: EntityId, body: string, replyTo?: string) => Promise<CampaignDiscussionNote>; setCampaignNoteDashboardPin: (campaignId: EntityId, noteId: string, pinned: boolean) => Promise<void>; createCampaignExpense: (campaignId: EntityId, input: CampaignExpenseInput) => Promise<void>; initialTab: CampaignTab; openTaskEditor: (id?: EntityId, campaignId?: EntityId) => void; mutateTask: (id: EntityId, patch: TaskPatch) => Promise<void>; saveCampaignKpi: (id: EntityId, input: CampaignKpiInput, existingId?: string) => Promise<void>; liveMode?: boolean; campaign: Campaign; data: AppData; identity?: UserIdentity; readOnly: boolean; onBack: () => void; onNavigate: (view: string) => void; setData: React.Dispatch<React.SetStateAction<AppData>>; notify: (message: string) => void; getAccessToken?: () => Promise<string | null>; uploadMedia?: (file: File, bucket?: string, prefix?: string) => Promise<string>; workspaceId?: string; onLifecycleAction?: (action: "archive" | "unarchive" | "trash") => void }) {
  const [activeTab, setActiveTab] = useState<CampaignTab>(initialTab);
  const [dialog, setDialog] = useState<CampaignDialogType | null>(null);
  const [editingTheme, setEditingTheme] = useState<CampaignInfluencerTheme | null>(null);
  const [editingPromo, setEditingPromo] = useState<CampaignPromo | null>(null);
  const [dialogError, setDialogError] = useState("");
  const today = useJakartaToday();
  const [editingPhase, setEditingPhase] = useState<CampaignPhase | null>(null);
  const [dialogPending, setDialogPending] = useState(false);
  const [instructionsPinPending, setInstructionsPinPending] = useState(false);
  const dialogSaving = useRef(false);
  const instructionsPinSaving = useRef(false);
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
  const influencerBookingOptions = useMemo(() => data.influencers.flatMap((influencer) => (influencer.rateCards || []).flatMap((rateCard) => {
    const accounts = (influencer.accounts || []).filter((account) => rateCard.platform === "Lainnya" || account.platform === rateCard.platform);
    return accounts.map((account) => ({
      value: JSON.stringify({ influencerId: String(influencer.id ?? influencer.name), accountId: account?.id ? String(account.id) : null, rateCardId: rateCard.id ? String(rateCard.id) : null }),
      label: `${influencer.name} · ${rateCard.name} · ${account?.platform || rateCard.platform}${account?.username ? ` @${account.username}` : ""} · ${influencer.collaborationType === "Barter Endorse" ? `Estimasi ${rupiah(rateCard.amount)}` : rupiah(rateCard.amount)}`,
    }));
  })), [data.influencers]);
  const campaignNotes = useMemo(() => (data.campaignNotes || []).filter((note) => entityKey(note.campaignId) === entityKey(campaign.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [campaign.id, data.campaignNotes]);
  const linkedInfluencers = useMemo(() => data.influencerSchedules.filter((item) => item.campaignId != null ? entityKey(item.campaignId) === entityKey(campaign.id) : item.campaign === campaign.name), [campaign.id, campaign.name, data.influencerSchedules]);
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
  const closeDialog = () => { if (dialogPending) return; setEditingPhase(null); setDialog(null); setDialogError(""); setEditingTheme(null); setEditingPromo(null); };
  const openDialog = (type: CampaignDialogType) => {
    const influencerDialog = type === "influencer-theme" || type === "influencer-booking";
    if (influencerDialog ? !canEditInfluencers : !canEditCampaign) return notify("Akun tidak memiliki izin untuk perubahan ini.");
    setEditingPhase(null);
    dialogVersion.current = campaign.rowVersion ?? 1;
    setDialog(type);
    if (type !== "influencer-theme") setEditingTheme(null);
    if (type !== "promo") setEditingPromo(null);
    setDialogError("");
  };

  const editPromo = (promo: CampaignPromo) => {
    if (!canEditCampaign) return notify("Akun tidak memiliki izin untuk perubahan ini.");
    dialogVersion.current = campaign.rowVersion ?? 1;
    setEditingPhase(null);
    setEditingTheme(null);
    setEditingPromo(promo);
    setDialog("promo");
    setDialogError("");
  };

  const deletePromo = async (promo: CampaignPromo) => {
    if (!canEditCampaign) return notify("Akun tidak memiliki izin untuk menghapus promo.");
    if (!window.confirm(`Hapus promo “${promo.title}”?`)) return;
    setDialogPending(true);
    try {
      const contentConfig: CampaignContentConfig = {
        ...emptyCampaignContent(),
        ...campaign.contentConfig,
        promos: presentationRef.current.promos.filter((item) => item.id !== promo.id),
      };
      await saveCampaign(campaign.id, { contentConfig }, campaign.rowVersion ?? 1);
      notify("Promo berhasil dihapus.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Promo gagal dihapus.");
    } finally {
      setDialogPending(false);
    }
  };

  const deleteReference = async (reference: CreativeReference) => {
    if (!canEditCampaign) return notify("Akun tidak memiliki izin untuk menghapus referensi.");
    if (!window.confirm(`Hapus gambar referensi “${reference.title}”?`)) return;
    setDialogPending(true);
    try {
      const token = await getAccessToken?.();
      if (reference.source === "backend") {
        if (!token) throw new Error("Sesi login tidak ditemukan.");
        const response = await fetch(`/api/campaigns/${campaign.id}/references?referenceId=${encodeURIComponent(reference.id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        const result = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok) throw new Error(result?.error || "Gambar referensi gagal dihapus.");
      }
      const next = { ...presentationRef.current, references: presentationRef.current.references.filter((item) => String(item.id) !== String(reference.id)) };
      presentationRef.current = next;
      setPresentation(next);
      notify("Gambar referensi berhasil dihapus.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Gambar referensi gagal dihapus.");
    } finally {
      setDialogPending(false);
    }
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
  const toggleInstructionsPin = async () => {
    if (!canEditCampaign || instructionsPinSaving.current || campaign.lifecycleStatus !== "active") return notify("Hanya Super Admin dapat mengubah pin catatan Campaign aktif.");
    const current = presentationRef.current;
    const nextPinned = !current.instructionsPinned;
    if (nextPinned && !current.instructions.trim()) return notify("Isi Instruksi penting terlebih dahulu sebelum dipin.");
    instructionsPinSaving.current = true;
    setInstructionsPinPending(true);
    try {
      const contentConfig: CampaignContentConfig = {
        ...emptyCampaignContent(),
        ...campaign.contentConfig,
        tagline: current.tagline,
        bigMessage: current.bigMessage,
        intro: current.intro,
        instructions: current.instructions,
        steps: current.steps,
        promos: current.promos,
        instructionsPinned: nextPinned,
        instructionsPinnedAt: nextPinned ? new Date().toISOString() : null,
      };
      await saveCampaign(campaign.id, { contentConfig }, campaign.rowVersion ?? 1);
      notify(nextPinned ? "Instruksi dipin ke Catatan penting." : "Pin instruksi dilepas.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Status pin instruksi gagal disimpan.");
    } finally {
      instructionsPinSaving.current = false;
      setInstructionsPinPending(false);
    }
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
          let selected: { influencerId: string; accountId: string | null; rateCardId: string | null };
          try { selected = JSON.parse(value("bookingChoice")) as typeof selected; }
          catch { throw new Error("Pilih influencer dan paket rate card."); }
          const agreedRateRaw = value("agreedRate");
          await saveInfluencerBooking(campaign.id, { ...selected, agreedRate: agreedRateRaw === "" ? undefined : Number(agreedRateRaw), themeId: value("themeId"), visitDate: value("visitDate") || null, uploadDate: value("uploadDate") || null });
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
      const budget = value("budget") === "" ? 0 : Number(value("budget"));
      if (!name || !brand) return setDialogError("Nama Campaign dan Brand wajib diisi.");
      const periodError = validateCampaignPeriod(startDate, endDate);
      if (periodError) return setDialogError(periodError);
      const budgetError = validateCampaignBudget(budget);
      if (budgetError) return setDialogError(budgetError);
      const phaseError = validateTimeline(presentation.phases, { startDate, endDate });
      if (phaseError) return setDialogError(phaseError);
      const memberIds = values.getAll("campaignMemberIds").map(String);
      const patch: CampaignSavePatch = { name, brandId: data.brands.find((item) => item.name === brand)?.id || null, objective: value("objective"), avatarUrl: value("avatarUrl") || null, startDate: startDate || null, endDate: endDate || null, memberIds };
      if (budget !== campaign.budget) patch.budget = budget;
      dialogSaving.current = true; setDialogPending(true);
      try {
        await saveCampaign(campaign.id, patch, dialogVersion.current);
        notify("Informasi dasar Campaign berhasil disimpan.");
      } catch (error) { setDialogError((error as Error).message); return; }
      finally { dialogSaving.current = false; setDialogPending(false); }
    }

    if (dialog === "brief") {
      const bigMessage = value("bigMessage");
      if (!bigMessage) return setDialogError("Big message wajib diisi agar tim memahami arah komunikasi campaign.");
      const instructions = value("instructions");
      const instructionsPinned = presentationRef.current.instructionsPinned && Boolean(instructions);
      const contentConfig: CampaignContentConfig = { ...emptyCampaignContent(), ...campaign.contentConfig, tagline: value("tagline"), bigMessage, intro: "", instructions, steps: [], instructionsPinned, instructionsPinnedAt: instructionsPinned ? presentationRef.current.instructionsPinnedAt : null };
      dialogSaving.current = true; setDialogPending(true);
      try { await saveCampaign(campaign.id, { contentConfig }, dialogVersion.current); notify("Brief Campaign berhasil disimpan."); }
      catch (error) { setDialogError((error as Error).message); return; }
      finally { dialogSaving.current = false; setDialogPending(false); }
    }

    if (dialog === "promo") {
      const startDate = value("startDate");
      const endDate = value("endDate");
      const title = value("title");
      if (!title || !startDate || !endDate) return setDialogError("Nama promo, tanggal mulai, dan tanggal selesai wajib diisi.");
      const periodError = validateCampaignPeriod(startDate, endDate);
      if (periodError) return setDialogError(periodError);
      const detail = value("detail");
      const promo: CampaignPromo = { id: editingPromo?.id || globalThis.crypto.randomUUID(), title, period: formatCampaignPeriod(startDate, endDate), startDate, endDate, detail: detail || "Mekanisme dan syarat belum dilengkapi.", status: editingPromo?.status || "Draf", summary: editingPromo?.summary };
      const promos = editingPromo ? presentation.promos.map((item) => item.id === promo.id ? promo : item) : [...presentation.promos, promo];
      const contentConfig: CampaignContentConfig = { ...emptyCampaignContent(), ...campaign.contentConfig, promos };
      dialogSaving.current = true; setDialogPending(true);
      try { await saveCampaign(campaign.id, { contentConfig }, dialogVersion.current); notify(editingPromo ? "Promo Campaign berhasil diperbarui." : "Promo Campaign berhasil disimpan."); }
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
      const title = value("referenceTitle");
      const url = value("referenceUrl");
      const mimeType = value("referenceMimeType");
      if (!title || !url) return setDialogError("Upload gambar terlebih dahulu.");
      const startDate = campaign.startDate || campaign.endDate || today;
      const endDate = campaign.endDate || startDate;
      const kind = "Gambar";
      let reference: CreativeReference = { id: globalThis.crypto.randomUUID(), title, url, kind, startDate, endDate, mimeType, source: "presentation" };
      const token = await getAccessToken?.();
      if (token) {
        const response = await fetch(`/api/campaigns/${campaign.id}/references`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ title: reference.title, url: reference.url, kind, startDate, endDate, mimeType: reference.mimeType }) });
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
    brief: <BriefPromoTab campaign={campaign} presentation={presentation} canEdit={canEditCampaign} pinPending={instructionsPinPending} onToggleInstructionsPin={() => void toggleInstructionsPin()} referenceSync={referenceSync} onEditBrief={() => openDialog("brief")} onAddPromo={() => openDialog("promo")} onEditPromo={editPromo} onDeletePromo={deletePromo} onAddReference={() => openDialog("reference")} onDeleteReference={deleteReference} />,
    timeline: <TimelineTasksTab today={today} onEditPhase={editPhase} phasePending={dialogPending} campaign={campaign} tasks={campaignTasks} users={data.users} identity={identity} readOnly={readOnly || identity?.accessRole === "viewer"} presentation={presentation} selectedPhaseId={activePhaseId} taskView={taskView} canEdit={canEditCampaign} onTaskView={setTaskView} onSelectPhase={setSelectedPhase} onAssignTaskPhase={assignTaskPhase} onTogglePhaseMode={() => void togglePhaseMode()} onAddPhase={() => openDialog("phase")} onAddTask={() => openTaskEditor(undefined, campaign.id)} onToggleTask={toggleTask} onTaskStatusChange={updateTaskStatus} onTaskAssigneesChange={updateTaskAssignees} onEditTask={editTask} />,
    content: <CampaignContentCalendarTab campaign={campaign} tasks={campaignTasks} schedules={linkedInfluencers} />,
    influencer: <CampaignInfluencerTab campaign={campaign} themes={campaignInfluencerThemesForCampaign(data.influencerThemes, campaign.id)} schedules={linkedInfluencers} influencers={data.influencers} canEdit={canEditInfluencers} canManagePayments={canManage && !readOnly} canDeleteThemes={canManage && !readOnly} onDeleteTheme={(id) => deleteInfluencerTheme(campaign.id, id)} onDeleteBooking={(id) => deleteInfluencerBooking(campaign.id, id)} onPaymentChange={async (id, status, amount) => { await setInfluencerBookingPayment(campaign.id, id, status, amount); notify("Status pembayaran dan riwayat spent Campaign diperbarui."); }} onBookingChange={async (id, patch) => { await saveInfluencerBooking(campaign.id, patch, id); notify("Jadwal influencer diperbarui."); }} onAddTheme={() => openDialog("influencer-theme")} onEditTheme={(theme) => { if (!canEditInfluencers) return; openDialog("influencer-theme"); setEditingTheme(theme); }} onAddBooking={() => openDialog("influencer-booking")} />,
    finance: <FinanceTab campaign={campaign} influencerSchedules={linkedInfluencers} expenses={(data.campaignExpenses || []).filter((item) => String(item.campaignId) === String(campaign.id))} canCreateExpense={!readOnly && canCreateCampaignExpense(identity, campaign)} onCreateExpense={(input) => createCampaignExpense(campaign.id, input)} notify={notify} />,
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

    {dialog && <CampaignDialog key={`${dialog}-${editingPhase?.id || editingPromo?.id || "new"}`} editingPhase={editingPhase} editingPromo={editingPromo} pending={dialogPending} type={dialog} campaign={campaign} data={data} presentation={presentation} editingTheme={editingTheme} campaignMemberIds={campaignMemberSelection(data, campaign)} influencerBookingOptions={influencerBookingOptions} canManage={canManage} error={dialogError} onClose={closeDialog} onSubmit={submitDialog} onUploadImage={dialog === "reference" ? uploadReferenceImage : undefined} onUploadCampaignAvatar={dialog === "info" ? uploadCampaignAvatar : undefined} />}
  </div>;
}


function BriefPromoTab({ campaign, presentation, canEdit, pinPending, onToggleInstructionsPin, referenceSync, onEditBrief, onAddPromo, onEditPromo, onDeletePromo, onAddReference, onDeleteReference }: { campaign: Campaign; presentation: PresentationState; canEdit: boolean; pinPending: boolean; onToggleInstructionsPin: () => void; referenceSync: "idle" | "loading" | "error"; onEditBrief: () => void; onAddPromo: () => void; onEditPromo: (promo: CampaignPromo) => void; onDeletePromo: (promo: CampaignPromo) => void; onAddReference: () => void; onDeleteReference: (reference: CreativeReference) => void }) {
  const hasBrief = Boolean(presentation.bigMessage || presentation.tagline || presentation.instructions);
  const hasStoredKpi = Boolean(campaign.kpi && campaign.kpi !== "Belum ditentukan");
  return <div className="campaign-tab-stack">
    <div className="campaign-section-intro"><div><h2>Brief campaign</h2><p>Susun konteks campaign agar tim dapat bekerja tanpa instruksi yang tersebar.</p></div></div>
    <div className="campaign-brief-grid">
      <div className="campaign-tab-stack">
        <section className="card">
          <CampaignSectionHeader icon="book" title="Brief utama" action={canEdit ? <button className="button button-soft button-sm" onClick={onEditBrief}><Icon name="edit" size={12} />{hasBrief ? "Edit brief" : "Lengkapi brief"}</button> : undefined} />
          {hasBrief ? <div className="campaign-brief-content"><div className="campaign-subheading">TAGLINE</div><h3>{presentation.tagline || "Belum ditentukan"}</h3><div className="campaign-subheading">BIG MESSAGE</div><h4>{presentation.bigMessage || "Belum ditentukan"}</h4></div> : <EmptyCampaignState icon="book" title="Brief utama belum lengkap" description={hasStoredKpi ? `Target existing “${campaign.kpi}” tetap tersedia, tetapi belum ada tagline atau big message.` : "Belum ada tagline atau big message."} action={canEdit ? <button className="button button-primary button-sm" onClick={onEditBrief}><Icon name="plus" size={12} />Tulis brief</button> : undefined} />}
        </section>
        <section className="card">
        <CampaignSectionHeader icon="image" title="Referensi kreatif" description="Link gambar, moodboard, atau dokumen acuan." action={canEdit ? <button className="button button-soft button-sm" onClick={onAddReference}><Icon name="plus" size={12} />Tambah referensi</button> : undefined} />
        {referenceSync === "loading" && <IntegrationNotice>Memuat referensi tersimpan…</IntegrationNotice>}
        {referenceSync === "error" && <IntegrationNotice tone="amber">Referensi tersimpan belum dapat dimuat. Pastikan migration Campaign Reference sudah dijalankan.</IntegrationNotice>}
          {presentation.references.length ? <div className="campaign-reference-grid">{presentation.references.map((reference) => <CreativeReferenceCard key={reference.id} reference={reference} onDelete={canEdit ? () => onDeleteReference(reference) : undefined} />)}</div> : <EmptyCampaignState icon="image" title="Belum ada referensi" description="Tambahkan tautan moodboard atau dokumen agar eksekusi kreatif lebih konsisten." />}
        </section>
        <section className="card">
          <CampaignSectionHeader icon="pin" title="Catatan penting" action={canEdit && presentation.instructions.trim() ? <button className="button button-soft button-sm" type="button" onClick={onToggleInstructionsPin} disabled={pinPending} aria-pressed={presentation.instructionsPinned}><Icon name={presentation.instructionsPinned ? "pin-off" : "pin"} size={12} />{pinPending ? "Menyimpan…" : presentation.instructionsPinned ? "Lepas pin" : "Pin ke catatan penting"}</button> : undefined} />
          {presentation.instructions ? <div className="campaign-important-note"><Icon name="alert" size={15} /><p>{presentation.instructions}</p></div> : <EmptyCampaignState icon="pin" title="Belum ada instruksi khusus" description="Gunakan bagian ini untuk syarat promo, batasan copy, atau detail yang wajib dikonfirmasi." />}
          {presentation.instructionsPinned && presentation.instructions.trim() && <small className="campaign-instructions-pin-state">Tersinkron ke Catatan penting pada Diskusi dan Dashboard anggota Campaign.</small>}
        </section>
      </div>

      <aside className="card campaign-promo-column">
        <CampaignSectionHeader icon="campaign" title="Promo & mekanisme" description="Periode, manfaat, kuota, syarat, dan status persetujuan." action={canEdit ? <button className="button button-primary button-sm" onClick={onAddPromo}><Icon name="plus" size={12} />Tambah promo</button> : undefined} />
        {presentation.promos.length ? presentation.promos.map((promo) => <PromoCard key={promo.id} promo={promo} canEdit={canEdit} onEdit={() => onEditPromo(promo)} onDelete={() => onDeletePromo(promo)} />) : <EmptyCampaignState icon="campaign" title="Belum ada promo terstruktur" description="Tambahkan draf promo untuk mereview periode dan mekanismenya." />}
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
function FinanceTab({ campaign, influencerSchedules, expenses, canCreateExpense, onCreateExpense, notify }: { campaign: Campaign; influencerSchedules: AppData["influencerSchedules"]; expenses: CampaignExpense[]; canCreateExpense: boolean; onCreateExpense: (input: CampaignExpenseInput) => Promise<void>; notify: (message: string) => void }) {
  const today = useJakartaToday();
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expensePending, setExpensePending] = useState(false);
  const [expenseError, setExpenseError] = useState("");
  const budget = Math.max(campaign.budget || 0, 0);
  const influencerSpent = influencerSchedules.reduce((total, item) => total + Math.max(item.spent || 0, 0), 0);
  const sumCategory = (key: CampaignExpense["category"]) => expenses.filter((expense) => expense.category === key).reduce((total, expense) => total + expense.amount, 0);
  const promoSubsidySpent = sumCategory("promo_subsidy");
  const adsSpent = sumCategory("ads");
  const otherRecordedSpent = sumCategory("other");
  const manualSpent = promoSubsidySpent + adsSpent + otherRecordedSpent;
  const legacySpent = Math.max((campaign.spent || 0) - influencerSpent - manualSpent, 0);
  const spent = Math.max(campaign.spent || 0, influencerSpent + manualSpent);
  const remaining = Math.max(budget - spent, 0);
  const otherSpent = otherRecordedSpent + legacySpent;
  const categories = [
    { key: "unused", label: "Belum terpakai", amount: remaining, color: "#d8dee8", note: "Sisa dari total anggaran" },
    { key: "promo_subsidy", label: campaignExpenseCategories.promo_subsidy, amount: promoSubsidySpent, color: "#e9a23b", note: "Realisasi subsidi promo" },
    { key: "influencer", label: "Influencer", amount: influencerSpent, color: "#7357df", note: "Pembayaran pada jadwal influencer" },
    { key: "ads", label: campaignExpenseCategories.ads, amount: adsSpent, color: "#39a58a", note: "Realisasi iklan" },
    { key: "other", label: campaignExpenseCategories.other, amount: otherSpent, color: "#de7d4c", note: legacySpent ? "Termasuk realisasi lama tanpa rincian kategori" : "Pengeluaran lain yang dicatat" },
  ];
  const chartTotal = Math.max(budget, spent);
  const circumference = 2 * Math.PI * 74;
  let dashOffset = 0;
  const segments = categories.filter((category) => chartTotal > 0 && category.amount > 0).map((category) => {
    const length = circumference * (category.amount / chartTotal);
    const segment = { key: category.key, color: category.color, length, offset: dashOffset };
    dashOffset += length;
    return segment;
  });
  type FinanceHistoryItem = { id: string; sortDate: string; title: string; subtitle: string; amount: number; icon: "wallet" | "users"; paymentStatus?: string };
  const history: FinanceHistoryItem[] = [
    ...expenses.map((expense) => ({ id: `expense-${expense.id}`, sortDate: expense.date, title: expense.title, subtitle: `${campaignExpenseCategories[expense.category]} · ${formatDisplayDate(expense.date)}${expense.details ? ` · ${expense.details}` : ""}`, amount: expense.amount, icon: "wallet" as const })),
    ...influencerSchedules.filter((item) => item.spent > 0).map((item) => ({ id: `influencer-${item.id}`, sortDate: item.uploadDate || "", title: item.influencer, subtitle: `${item.themeName || item.content || item.platform} · ${item.uploadDate ? `Jadwal upload ${formatDisplayDate(item.uploadDate)}` : "Tanggal pembayaran tidak tercatat"}`, amount: item.spent, icon: "users" as const, paymentStatus: displayInfluencerPaymentStatus(item.paymentStatus) })),
    ...(legacySpent > 0 ? [{ id: "legacy-spend", sortDate: "", title: "Realisasi sebelumnya", subtitle: "Tanggal dan rincian kategori tidak tersedia pada data lama", amount: legacySpent, icon: "wallet" as const }] : []),
  ].sort((a, b) => b.sortDate.localeCompare(a.sortDate) || a.title.localeCompare(b.title));

  const submitExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreateExpense || expensePending) return;
    setExpenseError("");
    const values = new FormData(event.currentTarget);
    const input: CampaignExpenseInput = {
      category: String(values.get("category") || "") as CampaignExpenseInput["category"],
      title: String(values.get("title") || "").trim(),
      amount: Number(values.get("amount")),
      date: String(values.get("date") || ""),
      details: String(values.get("details") || "").trim(),
    };
    const validationError = validateCampaignExpense(input);
    if (validationError) return setExpenseError(validationError);
    setExpensePending(true);
    try {
      await onCreateExpense(input);
      setExpenseDialogOpen(false);
      notify("Pengeluaran tersimpan dan masuk ke realisasi budget Campaign.");
    } catch (error) {
      setExpenseError(error instanceof Error ? error.message : "Pengeluaran gagal disimpan.");
    } finally {
      setExpensePending(false);
    }
  };

  return <div className="campaign-tab-stack campaign-finance-dashboard">
    <div className="campaign-section-intro"><div><h2>Keuangan campaign</h2><p>Pantau penggunaan budget dan seluruh pengeluaran yang tercatat di campaign ini.</p></div></div>
    <section className="card campaign-finance-summary">
      <header className="campaign-finance-summary-head"><div><h3>Penggunaan anggaran</h3><p>Realisasi mencakup pengeluaran Campaign dan pembayaran jadwal influencer.</p></div></header>
      <div className="campaign-finance-chart-layout">
        <div className="campaign-finance-donut-wrap">
          <svg className="campaign-finance-donut" viewBox="0 0 200 200" role="img" aria-label={`Realisasi ${rupiah(spent)} dari anggaran ${rupiah(budget)}`}>
            <circle className="campaign-finance-donut-track" cx="100" cy="100" r="74" />
            {segments.map((segment) => <circle key={segment.key} cx="100" cy="100" r="74" fill="none" stroke={segment.color} strokeWidth="25" strokeDasharray={`${segment.length} ${circumference - segment.length}`} strokeDashoffset={-segment.offset} />)}
            <text className="campaign-finance-donut-value" x="100" y="95" textAnchor="middle">{rupiah(spent)}</text>
            <text className="campaign-finance-donut-label" x="100" y="117" textAnchor="middle">sudah terealisasi</text>
          </svg>
        </div>
        <div className="campaign-finance-legend" aria-label="Rincian penggunaan budget">
          {categories.map((category) => <div className="campaign-finance-category" key={category.key}><span className="campaign-finance-category-name"><i style={{ backgroundColor: category.color }} /><span><strong>{category.label}</strong><small>{category.note}</small></span></span><strong className="campaign-finance-category-value">{rupiah(category.amount)}</strong></div>)}
        </div>
      </div>
      {!budget && <div className="campaign-finance-unset"><Icon name="info" size={15} /><span>Anggaran belum ditentukan. Atur budget lewat Edit informasi Campaign.</span></div>}
      {legacySpent > 0 && <p className="campaign-finance-data-note">Sebagian realisasi lama belum memiliki rincian kategori; nilainya dimasukkan ke Lainnya agar total pengeluaran tetap terlihat.</p>}
    </section>
    <section className="campaign-finance-metrics" aria-label="Ringkasan anggaran campaign">
      <article className="card campaign-finance-metric"><span>Total anggaran</span><strong>{rupiah(budget)}</strong><Icon name="wallet" size={17} /></article>
      <article className="card campaign-finance-metric realized"><span>Realisasi</span><strong>{rupiah(spent)}</strong><Icon name="chart" size={17} /></article>
      <article className="card campaign-finance-metric remaining"><span>Sisa anggaran</span><strong>{rupiah(remaining)}</strong><Icon name="target" size={17} /></article>
    </section>
    <section className="card campaign-finance-history">
      <header className="campaign-finance-history-header"><div><h3><Icon name="wallet" size={15} />Riwayat pengeluaran</h3><p>Semua pengeluaran campaign dan realisasi jadwal influencer.</p></div>{canCreateExpense && <button className="button button-primary button-sm" onClick={() => { setExpenseError(""); setExpenseDialogOpen(true); }}><Icon name="plus" size={14} />Tambah pengeluaran</button>}</header>
      {history.length ? <div className="campaign-finance-history-list">{history.map((item) => <article className="campaign-finance-history-row" key={item.id}><span className="campaign-finance-history-icon"><Icon name={item.icon} size={16} /></span><span className="campaign-finance-history-copy"><strong>{item.title}</strong><small>{item.subtitle}</small>{item.paymentStatus && <StatusPill status={item.paymentStatus} className={`campaign-influencer-status-pill payment-${influencerPaymentStatusTone(item.paymentStatus)}`} />}</span><strong className="campaign-finance-history-amount">{rupiah(item.amount)}</strong></article>)}</div> : <EmptyCampaignState icon="wallet" title="Belum ada riwayat pengeluaran" description="Pengeluaran yang dicatat dan pembayaran influencer akan tampil di sini." />}
    </section>
    {expenseDialogOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !expensePending) setExpenseDialogOpen(false); }}><section className="modal campaign-finance-expense-modal" role="dialog" aria-modal="true" aria-labelledby="campaign-expense-title"><div className="modal-head"><div><h2 id="campaign-expense-title">Tambah pengeluaran</h2><p>Pengeluaran ini langsung masuk ke realisasi dan riwayat budget Campaign.</p></div><button type="button" className="icon-button modal-close" aria-label="Tutup" disabled={expensePending} onClick={() => setExpenseDialogOpen(false)}><Icon name="close" /></button></div><form className="form-stack" onSubmit={(event) => void submitExpense(event)}><div className="form-field"><label htmlFor="campaign-expense-title-field">Nama pengeluaran *</label><input id="campaign-expense-title-field" className="modal-input" name="title" required maxLength={160} placeholder="Contoh: Cetak poster promo" /></div><div className="two-fields"><label className="form-field" htmlFor="campaign-expense-category">Kategori<select id="campaign-expense-category" className="modal-input" name="category" defaultValue="promo_subsidy"><option value="promo_subsidy">Subsidi promo</option><option value="ads">Ads</option><option value="other">Lainnya</option></select></label><label className="form-field" htmlFor="campaign-expense-date">Tanggal pengeluaran<input id="campaign-expense-date" className="modal-input" name="date" type="date" defaultValue={today} required /></label></div><div className="form-field"><label htmlFor="campaign-expense-amount">Jumlah (Rp) *</label><input id="campaign-expense-amount" className="modal-input" name="amount" type="number" min="0.01" max="999999999999.99" step="0.01" required placeholder="0" /></div><label className="form-field" htmlFor="campaign-expense-details">Catatan (opsional)<textarea id="campaign-expense-details" className="textarea" name="details" maxLength={2000} placeholder="Keterangan singkat pengeluaran" /></label>{expenseError && <div className="campaign-form-error" role="alert"><Icon name="alert" size={14} />{expenseError}</div>}<div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setExpenseDialogOpen(false)} disabled={expensePending}>Batal</button><button type="submit" className="button button-primary" disabled={expensePending}>{expensePending ? "Menyimpan…" : "Simpan pengeluaran"}</button></div></form></section></div>}
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
  const pinned = campaignImportantNotes(campaign, notes);
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
      <aside className="campaign-tab-stack"><section className="card"><CampaignSectionHeader icon="pin" title="Catatan penting" description="Catatan yang dipin akan tampil di Dashboard anggota Campaign." />{pinned.length ? pinned.map((note) => <div className="campaign-pinned-note" key={note.id}><strong>{note.source === "brief" ? "Brief & Promo" : note.authorName}</strong><p>{note.body}</p>{note.createdAt && <small>{formatDisplayDateTime(note.createdAt)}</small>}</div>) : <EmptyCampaignState icon="pin" title="Belum ada catatan penting" description="Pin instruksi dari Brief & Promo atau catatan diskusi agar mudah ditemukan anggota campaign di Dashboard." />}</section></aside>
    </div>
    <span className="sr-only">Campaign: {campaign.name}</span>
  </div>;
}

function CampaignDialog({ editingPhase, editingPromo, pending = false, type, campaign, data, presentation, editingTheme, campaignMemberIds, influencerBookingOptions, canManage, error, onClose, onSubmit, onUploadImage, onUploadCampaignAvatar }: { editingPhase?: CampaignPhase | null; editingPromo?: CampaignPromo | null; pending?: boolean; type: CampaignDialogType; campaign: Campaign; data: AppData; presentation: PresentationState; editingTheme: CampaignInfluencerTheme | null; campaignMemberIds: string[]; influencerBookingOptions: Array<{ value: string; label: string }>; canManage: boolean; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onUploadImage?: (file: File) => Promise<string>; onUploadCampaignAvatar?: (file: File) => Promise<string> }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const blockedRef = useRef(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [phaseStart, setPhaseStart] = useState(editingPhase?.startDate || "");
  const [phaseEnd, setPhaseEnd] = useState(editingPhase?.endDate || "");
  const today = useJakartaToday();
  const referenceFileInputRef = useRef<HTMLInputElement>(null);
  const [referenceUpload, setReferenceUpload] = useState<{ title: string; url: string; mimeType: string }>();
  const [referenceUploadError, setReferenceUploadError] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(campaign.avatarUrl || "");
  const [avatarUploadError, setAvatarUploadError] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingReference, setUploadingReference] = useState(false);
  blockedRef.current = uploadingAvatar || uploadingReference || pending;
  const brandLogo = data.brands.find((brand) => String(brand.id) === String(campaign.brandId) || brand.name === campaign.brand)?.logoUrl;
  const campaignPhaseNames = Array.from(new Set(orderedPhases(campaign.timelineConfig?.phases || []).map((phase) => phase.name.trim()).filter(Boolean)));
  const hasLegacyThemePhase = Boolean(editingTheme?.phase && !campaignPhaseNames.includes(editingTheme.phase));
  const info: Record<CampaignDialogType, { title: string; description: string }> = {
    info: { title: "Edit informasi Campaign", description: "Perbarui informasi dasar, budget, foto campaign, dan periode." },
    brief: { title: "Lengkapi brief campaign", description: "Simpan brief agar dapat dibaca seluruh tim Campaign." },
    promo: { title: editingPromo ? "Edit promo" : "Tambah promo", description: "Lengkapi periode dan mekanisme agar tidak menimbulkan interpretasi berbeda." },
    phase: { title: editingPhase ? "Edit fase" : "Tambah fase", description: "Pilih tanggal inklusif. Fase berikutnya dimulai setelah fase sebelumnya berakhir." },
    reference: { title: "Tambah gambar referensi", description: "Upload gambar atau tarik dan lepas gambar ke area di bawah." },
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

  const handleReferenceFile = async (file?: File) => {
    if (type !== "reference" || !file) return;
    setReferenceUploadError("");
    if (!file.type.startsWith("image/")) return setReferenceUploadError("Pilih file gambar untuk referensi kreatif.");
    if (file.size > 15 * 1024 * 1024) return setReferenceUploadError("Ukuran gambar maksimal 15 MB.");
    if (!onUploadImage) return setReferenceUploadError("Upload gambar membutuhkan koneksi Supabase aktif.");
    setUploadingReference(true);
    try {
      const url = await onUploadImage(file);
      setReferenceUpload({ title: file.name.replace(/\.[^.]+$/, "") || "Referensi gambar", url, mimeType: file.type });
    } catch (uploadError) {
      setReferenceUploadError(uploadError instanceof Error ? uploadError.message : "Upload gambar gagal.");
    } finally {
      setUploadingReference(false);
    }
  };

  const handleReferenceDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    void handleReferenceFile(event.dataTransfer.files?.[0]);
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

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !uploadingAvatar && !uploadingReference && !pending) onClose(); }}>
    <section ref={dialogRef} className="modal campaign-detail-modal" role="dialog" aria-modal="true" aria-labelledby="campaign-dialog-title" aria-describedby="campaign-dialog-description">
      <div className="modal-head"><div><h2 id="campaign-dialog-title">{info[type].title}</h2><p id="campaign-dialog-description">{info[type].description}</p></div><button type="button" className="icon-button modal-close" onClick={onClose} aria-label="Tutup" disabled={uploadingAvatar || uploadingReference || pending}><Icon name="close" /></button></div>
      <form onSubmit={(event) => { if (uploadingAvatar || uploadingReference || pending) { event.preventDefault(); if (uploadingReference) setReferenceUploadError("Tunggu sampai upload gambar selesai."); else setAvatarUploadError("Tunggu sampai upload foto selesai."); return; } onSubmit(event); }} className="form-stack">
        {type === "info" && <><div className="campaign-avatar-editor"><CampaignAvatar src={avatarUrl || null} fallbackSrc={brandLogo} initials={campaign.brand === "HBI" ? "H" : "HB"} /><div className="campaign-avatar-editor-copy"><strong>Foto campaign</strong><span>{onUploadCampaignAvatar ? "Gunakan foto khusus atau logo brand sebagai tampilan default." : "Hubungkan Supabase untuk mengunggah foto; logo brand tetap digunakan sebagai tampilan default."}</span><div><input ref={avatarInputRef} className="campaign-avatar-file" type="file" accept="image/*" aria-label="Pilih foto campaign" onChange={handleAvatarChange} /><button type="button" className="button button-soft button-sm" onClick={() => avatarInputRef.current?.click()} disabled={!onUploadCampaignAvatar || uploadingAvatar}><Icon name="image" size={13} />{uploadingAvatar ? "Mengunggah…" : "Ganti foto"}</button>{avatarUrl && <button type="button" className="button button-ghost button-sm" onClick={() => { setAvatarUrl(""); setAvatarUploadError(""); }} disabled={uploadingAvatar || pending}>Gunakan logo brand</button>}</div>{avatarUploadError && <small className="campaign-avatar-error" role="alert">{avatarUploadError}</small>}</div><input type="hidden" name="avatarUrl" value={avatarUrl} readOnly /></div><Field label="Nama Campaign" name="name" required defaultValue={campaign.name} placeholder="Contoh: Grand Opening RUMA Purwokerto" /><Select label="Brand" name="brand" values={campaignBrands(data, campaign.brand)} defaultValue={campaign.brand} required /><div className="campaign-form-group"><div><strong>Periode Campaign</strong><span>Opsional, kosongkan bila belum ditentukan.</span></div><div className="two-fields"><Field label="Tanggal mulai" name="startDate" type="date" defaultValue={campaign.startDate || ""} /><Field label="Tanggal selesai" name="endDate" type="date" defaultValue={campaign.endDate || ""} min={campaign.startDate || undefined} /></div></div><Field label="Budget Campaign (Rp)" name="budget" type="number" min="0" max="999999999999.99" step="0.01" defaultValue={String(campaign.budget || 0)} placeholder="0" /><div className="campaign-form-hint">Hanya Super Admin dapat mengubah anggaran Campaign.</div><TextArea label="Tujuan Singkat" name="objective" defaultValue={campaign.objective} placeholder="Apa tujuan utama campaign ini?" /><fieldset className="campaign-members-field"><legend>Anggota Campaign</legend><p>Anggota yang dipilih dapat melihat campaign dan catatan yang dipin di Dashboard. PIC tugas tetap diatur pada masing-masing tugas.</p><div className="campaign-members-list">{data.users.filter((user) => user.status === "Aktif").map((user) => <label key={user.id ?? user.username}><input type="checkbox" name="campaignMemberIds" value={String(user.id ?? user.username)} defaultChecked={campaignMemberIds.includes(String(user.id ?? user.username))} /><Avatar name={user.name} src={user.avatarUrl} /><span>{user.name}<small>{user.role}</small></span></label>)}</div></fieldset></>}
        {type === "brief" && <><Field label="Tagline" name="tagline" defaultValue={presentation.tagline} placeholder="Contoh: Make it Machiro" /><TextArea label="Big message" name="bigMessage" required defaultValue={presentation.bigMessage} placeholder="Pesan utama yang harus dipahami audiens" /><TextArea label="Instruksi penting" name="instructions" defaultValue={presentation.instructions} placeholder="Syarat promo atau hal yang wajib dikonfirmasi" /></>}
        {type === "promo" && <><Field label="Nama promo" name="title" required defaultValue={editingPromo?.title} placeholder="Contoh: Diskon 30%" /><div className="campaign-form-group"><div><strong>Periode promo</strong><span>Pilih tanggal mulai dan selesai.</span></div><div className="two-fields"><Field label="Tanggal mulai" name="startDate" type="date" required defaultValue={editingPromo?.startDate || ""} /><Field label="Tanggal selesai" name="endDate" type="date" required defaultValue={editingPromo?.endDate || ""} /></div></div><TextArea label="Mekanisme & syarat" name="detail" defaultValue={editingPromo?.detail} placeholder="Kuota, eligibility, cara klaim, dan batasan (opsional)" /><div className="campaign-form-hint">{editingPromo ? "Status promo tetap dipertahankan saat diedit." : <>Promo baru akan dibuat sebagai <strong>Draft</strong>.</>}</div></>}
        {type === "phase" && <><Field label="Nama fase" name="name" required defaultValue={editingPhase?.name} placeholder="Contoh: Teaser" /><div className="two-fields"><label className="form-field">Tanggal mulai *<input className="modal-input" aria-label="Tanggal mulai fase" type="date" name="startDate" required value={phaseStart} min={campaign.startDate || undefined} max={campaign.endDate || undefined} onChange={(event) => setPhaseStart(event.target.value)} /></label><label className="form-field">Tanggal selesai *<input className="modal-input" aria-label="Tanggal selesai fase" type="date" name="endDate" required value={phaseEnd} min={phaseStart || campaign.startDate || undefined} max={campaign.endDate || undefined} onChange={(event) => setPhaseEnd(event.target.value)} /></label></div><TextArea label="Tujuan fase" name="purpose" defaultValue={editingPhase?.purpose} placeholder="Apa yang harus dicapai pada fase ini?" /><div className="campaign-form-hint" aria-live="polite">{datedPhase({ startDate: phaseStart, endDate: phaseEnd } as CampaignPhase) ? phaseTimeState({ startDate: phaseStart, endDate: phaseEnd } as CampaignPhase, today) : "Keadaan waktu dihitung otomatis setelah tanggal diisi."}</div></>}
        {type === "reference" && <label className={`campaign-reference-dropzone ${referenceUpload ? "has-file" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={handleReferenceDrop}>
          <input ref={referenceFileInputRef} className="campaign-reference-file" type="file" accept="image/*" onChange={(event) => { void handleReferenceFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} disabled={uploadingReference || pending} />
          <span className="campaign-reference-dropzone-icon"><Icon name="image" size={22} /></span>
          <strong>{uploadingReference ? "Mengunggah gambar…" : referenceUpload ? referenceUpload.title : "Tarik & lepas gambar di sini"}</strong>
          <span>{referenceUpload ? "Gambar siap disimpan ke referensi campaign." : "atau klik untuk memilih gambar dari perangkat"}</span>
          <input type="hidden" name="referenceTitle" value={referenceUpload?.title || ""} readOnly />
          <input type="hidden" name="referenceUrl" value={referenceUpload?.url || ""} readOnly />
          <input type="hidden" name="referenceMimeType" value={referenceUpload?.mimeType || ""} readOnly />
          {referenceUploadError && <small role="alert">{referenceUploadError}</small>}
        </label>}
        {type === "influencer-theme" && <><div className="two-fields"><Field label="Kode tema" name="themeCodePreview" readOnly defaultValue={editingTheme?.code || nextCampaignInfluencerThemeCode(data.influencerThemes, campaign.id)} /><Field label="Nama tema" name="name" required defaultValue={editingTheme?.name} placeholder="Contoh: Menu Baru" /></div><div className="two-fields"><div className="form-field"><label htmlFor="campaign-field-phase">Fase</label><select id="campaign-field-phase" className="modal-input" name="phase" defaultValue={editingTheme?.phase || ""}><option value="">Tanpa fase</option>{hasLegacyThemePhase && <option value={editingTheme!.phase}>Fase tersimpan: {editingTheme!.phase}</option>}{campaignPhaseNames.map((phase) => <option value={phase} key={phase}>{phase}</option>)}</select></div><Field label="Tujuan" name="objective" defaultValue={editingTheme?.objective} placeholder="Contoh: Alasan datang" /></div>{campaignPhaseNames.length === 0 && <div className="campaign-form-hint">Campaign ini belum memiliki fase. Tema tetap bisa dibuat tanpa fase; tambahkan fase dari tab Timeline &amp; Tugas jika diperlukan.</div>}<TextArea label="Isi wajib" name="requiredContent" defaultValue={editingTheme?.requiredContent} placeholder="Detail yang wajib disampaikan atau ditampilkan" /><TextArea label="CTA" name="cta" defaultValue={editingTheme?.cta} placeholder="Contoh: Tag teman" /></>}
        {type === "influencer-booking" && <><Select label="Influencer · akun · paket" name="bookingChoice" values={influencerBookingOptions.map((item) => item.value)} labels={influencerBookingOptions.map((item) => item.label)} required /><Select label="Tema konten" name="themeId" values={campaignInfluencerThemesForCampaign(data.influencerThemes, campaign.id).map((item) => String(item.id))} labels={campaignInfluencerThemesForCampaign(data.influencerThemes, campaign.id).map((item) => `${item.code} · ${item.name}`)} required /><div className="two-fields"><Field label="Tanggal visit" name="visitDate" type="date" /><Field label="Tanggal upload" name="uploadDate" type="date" /></div>{canManage && <Field label="Harga / estimasi yang disepakati (opsional)" name="agreedRate" type="number" min="0" max="999999999999" step="1" placeholder="Kosongkan untuk memakai nilai paket" />}<div className="campaign-form-hint">Harga paket tersimpan sebagai snapshot. Untuk Barter Endorse nilainya menjadi estimasi dan tidak masuk pengeluaran; untuk Influencer, spent hanya bertambah saat pembayaran dicatat.</div></>}
        {error && <div className="campaign-form-error" role="alert"><Icon name="alert" size={14} />{error}</div>}
        <div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose} disabled={uploadingAvatar || uploadingReference || pending}>Batal</button><button type="submit" className="button button-primary" disabled={uploadingAvatar || uploadingReference || pending}>{uploadingAvatar ? "Mengunggah foto…" : uploadingReference ? "Mengunggah gambar…" : pending ? "Menyimpan…" : type === "reference" ? "Simpan gambar" : "Simpan perubahan"}</button></div>
      </form>
    </section>
  </div>;
}

function Field({ label, name, required, type = "text", defaultValue, placeholder, min, max, step, readOnly }: { label: string; name: string; required?: boolean; type?: string; defaultValue?: string; placeholder?: string; min?: string; max?: string; step?: string; readOnly?: boolean }) {
  const id = `campaign-field-${name}`;
  return <div className="form-field"><label htmlFor={id}>{label}{required ? " *" : ""}</label><input id={id} className="modal-input" name={name} type={type} required={required} defaultValue={defaultValue} placeholder={placeholder} min={min} max={max} step={step} readOnly={readOnly} /></div>;
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
