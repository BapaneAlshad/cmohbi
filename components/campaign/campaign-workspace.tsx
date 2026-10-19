"use client";

import { ClipboardEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { AppData, EntityId, Task, UserIdentity } from "@/lib/types";
import { formatCampaignPeriod, validateCampaignPeriod } from "@/lib/campaign-form";
import { Avatar, Icon, rupiah, StatusPill } from "@/components/ui";
import {
  BudgetProgress,
  CampaignKpiRow,
  CampaignNote,
  CampaignPhase,
  CampaignPromo,
  CampaignSectionHeader,
  CampaignStatCard,
  CampaignTaskRow,
  CreativeReference,
  CreativeReferenceCard,
  EmptyCampaignState,
  InfluencerBriefCard,
  IntegrationNotice,
  PresentationBadge,
  PromoCard,
  PhaseCard,
  type CampaignNoteItem,
} from "./campaign-primitives";

type Campaign = AppData["campaigns"][number];
type CampaignTab = "overview" | "brief" | "timeline" | "content" | "finance" | "discussion";
type CampaignDialogType = "info" | "brief" | "kpi" | "promo" | "phase" | "task" | "reference";

type PresentationKpi = {
  id: string;
  name: string;
  current: number;
  target: number;
  unit: "Angka" | "Persen" | "Rupiah";
};

type PresentationState = {
  tagline: string;
  bigMessage: string;
  intro: string;
  instructions: string;
  steps: string[];
  phaseMode: boolean;
  phases: CampaignPhase[];
  taskPhase: Record<string, string>;
  kpis: PresentationKpi[];
  promos: CampaignPromo[];
  references: CreativeReference[];
  notes: CampaignNoteItem[];
  acknowledged: boolean;
};

const tabs: Array<{ id: CampaignTab; label: string; icon: string }> = [
  { id: "overview", label: "Ringkasan", icon: "home" },
  { id: "brief", label: "Brief & Promo", icon: "book" },
  { id: "timeline", label: "Timeline & Tugas", icon: "check-square" },
  { id: "content", label: "Konten & Influencer", icon: "film" },
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
  kpis: [],
  promos: [],
  references: [],
  notes: [],
  acknowledged: false,
});

function entityKey(value: EntityId) {
  return String(value);
}

function formatUnit(value: number, unit: PresentationKpi["unit"]) {
  if (unit === "Rupiah") return rupiah(value);
  if (unit === "Persen") return `${value}%`;
  return new Intl.NumberFormat("id-ID").format(value);
}

function formatTransactionDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
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
}: {
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
  return <CampaignWorkspaceContent campaign={campaign} data={data} identity={identity} readOnly={readOnly} onBack={onBack} onNavigate={onNavigate} setData={setData} notify={notify} getAccessToken={getAccessToken} uploadMedia={uploadMedia} workspaceId={workspaceId} onLifecycleAction={onLifecycleAction} />;
}

function CampaignWorkspaceSkeleton() {
  return <div className="campaign-skeleton" aria-label="Memuat detail campaign"><div className="campaign-skeleton-line wide" /><div className="campaign-skeleton-line short" /><div className="campaign-skeleton-tabs" /><div className="campaign-skeleton-grid"><div /><div /><div /></div></div>;
}

function CampaignWorkspaceContent({ campaign, data, identity, readOnly, onBack, onNavigate, setData, notify, getAccessToken, uploadMedia, workspaceId, onLifecycleAction }: { campaign: Campaign; data: AppData; identity?: UserIdentity; readOnly: boolean; onBack: () => void; onNavigate: (view: string) => void; setData: React.Dispatch<React.SetStateAction<AppData>>; notify: (message: string) => void; getAccessToken?: () => Promise<string | null>; uploadMedia?: (file: File, bucket?: string, prefix?: string) => Promise<string>; workspaceId?: string; onLifecycleAction?: (action: "archive" | "unarchive" | "trash") => void }) {
  const [activeTab, setActiveTab] = useState<CampaignTab>("overview");
  const [dialog, setDialog] = useState<CampaignDialogType | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [presentation, setPresentation] = useState<PresentationState>(emptyPresentation);
  const [selectedPhase, setSelectedPhase] = useState<string>("");
  const [taskView, setTaskView] = useState<"phase" | "all">("phase");
  const [contentFilter, setContentFilter] = useState<"all" | "internal" | "influencer">("all");
  const [replyTo, setReplyTo] = useState<string | undefined>();
  const [lifecycleMenuOpen, setLifecycleMenuOpen] = useState(false);
  const [referenceSync, setReferenceSync] = useState<"idle" | "loading" | "error">("idle");
  const canManage = identity?.accessRole === "owner" || identity?.accessRole === "admin";
  const canEdit = !readOnly && identity?.accessRole !== "viewer";

  const campaignTasks = useMemo(() => data.tasks.filter((task) => entityKey(task.campaign ?? "") === entityKey(campaign.id)), [campaign.id, data.tasks]);
  const linkedInfluencers = useMemo(() => data.influencerSchedules.filter((item) => item.campaignId != null ? entityKey(item.campaignId) === entityKey(campaign.id) : item.campaign === campaign.name), [campaign.id, campaign.name, data.influencerSchedules]);
  const brandContentCandidates = useMemo(() => data.content.filter((item) => item.brand === campaign.brand), [campaign.brand, data.content]);
  const brandTransactionCandidates = useMemo(() => data.transactions.filter((item) => item.brand === campaign.brand), [campaign.brand, data.transactions]);
  const completedTasks = campaignTasks.filter((task) => task.status === "Done").length;
  const taskProgress = campaignTasks.length ? Math.round((completedTasks / campaignTasks.length) * 100) : 0;
  const budgetProgress = campaign.budget ? Math.round((campaign.spent / campaign.budget) * 100) : 0;
  const teamNames = Array.from(new Set(campaignTasks.map((task) => task.pic).filter((name) => Boolean(name) && name !== "Belum ditentukan")));
  const currentPhase = presentation.phases.find((phase) => phase.id === selectedPhase) || presentation.phases[0];
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
        setPresentation((current) => ({ ...current, references: (result.references || []).map((reference) => ({ id: reference.id, title: reference.title, url: reference.url, kind: reference.kind, startDate: reference.start_date, endDate: reference.end_date, mimeType: reference.mime_type || undefined, source: "backend" as const })) }));
        setReferenceSync("idle");
      } catch {
        if (active) setReferenceSync("error");
      }
    })();
    return () => { active = false; };
  }, [campaign.id, getAccessToken]);

  const updatePresentation = (update: (current: PresentationState) => PresentationState) => {
    if (!canEdit) return notify("Akun Viewer memiliki akses baca saja pada Campaign.");
    setPresentation((current) => update(current));
  };
  const closeDialog = () => { setDialog(null); setDialogError(""); };
  const openDialog = (type: CampaignDialogType) => {
    if (!canEdit) return notify("Akun Viewer memiliki akses baca saja pada Campaign.");
    setDialog(type);
    setDialogError("");
  };

  const toggleTask = (taskId: EntityId) => {
    if (!canEdit) return notify("Akun Viewer tidak dapat mengubah status tugas.");
    setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === taskId ? { ...task, status: task.status === "Done" ? "To Do" : "Done" } : task) }));
    notify("Status tugas berhasil diperbarui dan tetap menggunakan data To-Do.");
  };

  const uploadReferenceImage = async (file: File) => {
    if (!uploadMedia || !workspaceId) throw new Error("Paste gambar membutuhkan koneksi Supabase aktif.");
    return uploadMedia(file, "campaign-references", `${workspaceId}/${campaign.id}`);
  };

  const submitDialog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDialogError("");
    if (!dialog) return;
    if (!canEdit) return setDialogError("Akun Viewer tidak memiliki izin untuk menyimpan perubahan Campaign.");
    const values = new FormData(event.currentTarget);
    const value = (name: string) => String(values.get(name) || "").trim();

    if (dialog === "info") {
      const name = value("name");
      const brand = value("brand");
      const startDate = value("startDate");
      const endDate = value("endDate");
      if (!name || !brand) return setDialogError("Nama Campaign dan Brand wajib diisi.");
      const periodError = validateCampaignPeriod(startDate, endDate);
      if (periodError) return setDialogError(periodError);
      setData((current) => ({ ...current, campaigns: current.campaigns.map((item) => String(item.id) === String(campaign.id) ? { ...item, name, brand, objective: value("objective"), startDate: startDate || null, endDate: endDate || null, period: formatCampaignPeriod(startDate, endDate) } : item) }));
      notify("Informasi dasar Campaign berhasil diperbarui.");
    }

    if (dialog === "brief") {
      const bigMessage = value("bigMessage");
      if (!bigMessage) return setDialogError("Big message wajib diisi agar tim memahami arah komunikasi campaign.");
      updatePresentation((current) => ({ ...current, tagline: value("tagline"), bigMessage, intro: value("intro"), instructions: value("instructions"), steps: value("steps").split("\n").map((item) => item.trim()).filter(Boolean) }));
      notify("Draf brief diperbarui untuk sesi tampilan ini.");
    }

    if (dialog === "kpi") {
      const target = Number(value("target"));
      const currentValue = Number(value("current"));
      if (!value("name") || !Number.isFinite(target) || target <= 0 || !Number.isFinite(currentValue) || currentValue < 0) return setDialogError("Isi nama KPI, realisasi, dan target yang valid. Target harus lebih dari nol.");
      const kpi: PresentationKpi = { id: globalThis.crypto.randomUUID(), name: value("name"), current: currentValue, target, unit: value("unit") as PresentationKpi["unit"] };
      updatePresentation((current) => ({ ...current, kpis: [...current.kpis, kpi] }));
      notify("KPI presentasi ditambahkan. Data ini belum tersimpan ke backend.");
    }

    if (dialog === "promo") {
      const startDate = value("startDate");
      const endDate = value("endDate");
      if (!value("title") || !startDate || !endDate) return setDialogError("Nama promo, tanggal mulai, dan tanggal selesai wajib diisi.");
      const periodError = validateCampaignPeriod(startDate, endDate);
      if (periodError) return setDialogError(periodError);
      const detail = value("detail");
      const promo: CampaignPromo = { id: globalThis.crypto.randomUUID(), title: value("title"), period: formatCampaignPeriod(startDate, endDate), startDate, endDate, detail: detail || "Mekanisme dan syarat belum dilengkapi.", status: "Draf" };
      updatePresentation((current) => ({ ...current, promos: [...current.promos, promo] }));
      notify("Promo ditambahkan sebagai draf tampilan sementara.");
    }

    if (dialog === "phase") {
      if (!value("name") || !value("period")) return setDialogError("Nama dan periode fase wajib diisi.");
      const phase: CampaignPhase = { id: globalThis.crypto.randomUUID(), name: value("name"), period: value("period"), purpose: value("purpose") || "Tujuan fase belum dilengkapi.", status: value("status") || "Rencana" };
      updatePresentation((current) => ({ ...current, phaseMode: true, phases: [...current.phases, phase] }));
      setSelectedPhase(phase.id);
      notify("Fase presentasi ditambahkan. Pengelompokan fase belum tersimpan ke backend.");
    }

    if (dialog === "task") {
      if (!value("title") || !value("due")) return setDialogError("Judul tugas dan tenggat wajib diisi.");
      const id = globalThis.crypto.randomUUID();
      const task: Task = { id, title: value("title"), brand: campaign.brand, pic: value("pic") || "Belum ditentukan", due: value("due"), dueDate: value("due"), priority: value("priority") || "Sedang", status: "To Do", campaign: campaign.id };
      setData((current) => ({ ...current, tasks: [...current.tasks, task] }));
      const phaseId = value("phaseId");
      if (phaseId) updatePresentation((current) => ({ ...current, taskPhase: { ...current.taskPhase, [id]: phaseId } }));
      notify("Tugas ditambahkan dan terhubung ke Campaign serta modul To-Do.");
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
      notify(token ? "Referensi berhasil disimpan." : "Referensi ditambahkan sebagai draf tampilan sementara.");
    }

    closeDialog();
  };

  const assignTaskPhase = (taskId: EntityId, phaseId: string) => updatePresentation((current) => {
    const taskPhase = { ...current.taskPhase };
    if (phaseId) taskPhase[entityKey(taskId)] = phaseId;
    else delete taskPhase[entityKey(taskId)];
    return { ...current, taskPhase };
  });

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab.id);
    document.getElementById(`campaign-tab-${nextTab.id}`)?.focus();
  };

  const shareSummary = async () => {
    const summary = `${campaign.name} · ${campaign.brand} · ${campaign.period} · ${campaign.status}`;
    try {
      if (navigator.share) await navigator.share({ title: campaign.name, text: summary });
      else await navigator.clipboard.writeText(summary);
      notify("Ringkasan campaign siap dibagikan.");
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") notify("Ringkasan belum dapat disalin. Coba kembali dari browser yang mendukung clipboard.");
    }
  };

  const tabContent = {
    overview: <OverviewTab campaign={campaign} tasks={campaignTasks} completedTasks={completedTasks} taskProgress={taskProgress} budgetProgress={budgetProgress} presentation={presentation} teamNames={teamNames} linkedInfluencerCount={linkedInfluencers.length} canEdit={canEdit} onOpenTab={setActiveTab} onEditInfo={() => openDialog("info")} onEditBrief={() => openDialog("brief")} onAddKpi={() => openDialog("kpi")} onAddPromo={() => openDialog("promo")} onToggleTask={toggleTask} onAcknowledge={() => updatePresentation((current) => ({ ...current, acknowledged: !current.acknowledged }))} />,
    brief: <BriefPromoTab campaign={campaign} presentation={presentation} canEdit={canEdit} referenceSync={referenceSync} onEditBrief={() => openDialog("brief")} onAddPromo={() => openDialog("promo")} onAddReference={() => openDialog("reference")} />,
    timeline: <TimelineTasksTab campaign={campaign} tasks={campaignTasks} presentation={presentation} selectedPhaseId={activePhaseId} taskView={taskView} canEdit={canEdit} onTaskView={setTaskView} onSelectPhase={setSelectedPhase} onAssignTaskPhase={assignTaskPhase} onTogglePhaseMode={() => { updatePresentation((current) => ({ ...current, phaseMode: !current.phaseMode })); if (canEdit) notify("Mode fase diubah untuk sesi tampilan ini."); }} onAddPhase={() => openDialog("phase")} onAddTask={() => openDialog("task")} onToggleTask={toggleTask} />,
    content: <ContentInfluencerTab linkedInfluencers={linkedInfluencers} brandContent={brandContentCandidates} filter={contentFilter} onFilter={setContentFilter} onNavigate={onNavigate} />,
    finance: <FinanceTab campaign={campaign} transactionCandidates={brandTransactionCandidates} onNavigate={onNavigate} />,
    discussion: <DiscussionTab identity={identity} presentation={presentation} replyTo={replyTo} canEdit={canEdit} onReply={setReplyTo} onUpdate={updatePresentation} notify={notify} />,
  } satisfies Record<CampaignTab, React.ReactNode>;

  return <div className="campaign-workspace">
    <button className="campaign-back-button" onClick={onBack}><Icon name="arrow-left" size={14} />Kembali ke daftar campaign</button>
    {readOnly && <div className="campaign-archived-banner"><div><Icon name="archive" size={16} /><span><strong>Campaign ini telah diarsipkan.</strong> Detail tetap tersedia dalam mode baca saja.</span></div>{canManage && <button className="button button-soft button-sm" onClick={() => onLifecycleAction?.("unarchive")}><Icon name="restore" size={13} />Buka Arsip</button>}</div>}
    <div className="campaign-workspace-eyebrow">WORKSPACE / CAMPAIGN / DETAIL</div>
    <header className="campaign-detail-header">
      <div>
        <div className="campaign-detail-title"><h1>{campaign.name}</h1><StatusPill status={campaign.status} /></div>
        <p>{campaign.brand}<span>•</span>{campaign.period}</p>
      </div>
      <div className="campaign-detail-actions"><button className="button button-soft" onClick={shareSummary}><Icon name="share" size={14} />Bagikan ringkasan</button><button className="button button-primary" onClick={() => openDialog("info")} disabled={!canEdit} title={!canEdit ? "Akses baca saja" : undefined}><Icon name="edit" size={14} />Edit informasi</button>{canManage && <div className="campaign-action-wrap"><button className="icon-button" onClick={() => setLifecycleMenuOpen(!lifecycleMenuOpen)} aria-label="Aksi lifecycle campaign"><Icon name="more-horizontal" /></button>{lifecycleMenuOpen && <div className="campaign-action-menu detail">{readOnly ? <button onClick={() => onLifecycleAction?.("unarchive")}><Icon name="restore" size={14} />Buka Arsip</button> : <button onClick={() => onLifecycleAction?.("archive")}><Icon name="archive" size={14} />Arsipkan Campaign</button>}<button className="danger" onClick={() => { if (window.confirm(`Pindahkan ${campaign.name} ke daftar Dihapus?`)) onLifecycleAction?.("trash"); }}><Icon name="trash" size={14} />Hapus Campaign</button></div>}</div>}</div>
    </header>

    <nav className="campaign-tabs" role="tablist" aria-label="Detail campaign">
      {tabs.map((tab, index) => <button type="button" role="tab" id={`campaign-tab-${tab.id}`} aria-controls="campaign-tab-panel" aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} className={activeTab === tab.id ? "active" : ""} key={tab.id} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => handleTabKeyDown(event, index)}><Icon name={tab.icon} size={14} />{tab.label}{tab.id === "discussion" && presentation.notes.length > 0 && <span>{presentation.notes.length}</span>}</button>)}
    </nav>

    <div className="campaign-tab-panel" role="tabpanel" id="campaign-tab-panel" aria-labelledby={`campaign-tab-${activeTab}`}>{tabContent[activeTab]}</div>
    <IntegrationNotice tone="amber"><strong>Mode review UI/UX.</strong> Brief, promo, KPI tambahan, fase, dan diskusi masih memakai state presentasi sementara. Referensi tersimpan ke Supabase saat koneksi live aktif; tugas tetap menggunakan sumber data To-Do yang sudah ada.</IntegrationNotice>

    {dialog && <CampaignDialog type={dialog} campaign={campaign} data={data} presentation={presentation} error={dialogError} onClose={closeDialog} onSubmit={submitDialog} onUploadImage={dialog === "reference" ? uploadReferenceImage : undefined} />}
  </div>;
}

function OverviewTab({ campaign, tasks, completedTasks, taskProgress, budgetProgress, presentation, teamNames, linkedInfluencerCount, canEdit, onOpenTab, onEditInfo, onEditBrief, onAddKpi, onAddPromo, onToggleTask, onAcknowledge }: { campaign: Campaign; tasks: Task[]; completedTasks: number; taskProgress: number; budgetProgress: number; presentation: PresentationState; teamNames: string[]; linkedInfluencerCount: number; canEdit: boolean; onOpenTab: (tab: CampaignTab) => void; onEditInfo: () => void; onEditBrief: () => void; onAddKpi: () => void; onAddPromo: () => void; onToggleTask: (id: EntityId) => void; onAcknowledge: () => void }) {
  const activePhase = presentation.phases.find((phase) => phase.status === "Berjalan" || phase.status === "Aktif") || presentation.phases[0];
  const pendingTasks = tasks.filter((task) => task.status !== "Done");
  const hasStoredKpi = Boolean(campaign.kpi && campaign.kpi !== "Belum ditentukan");
  const kpiCount = presentation.kpis.length + (hasStoredKpi ? 1 : 0);
  const hasBudgetData = campaign.budget > 0 || campaign.spent > 0;
  return <div className="campaign-tab-stack">
    {!campaign.startDate && !campaign.endDate && <div className="campaign-period-prompt"><div><Icon name="calendar" size={15} /><span><strong>Periode belum ditentukan</strong>Atur tanggal mulai dan selesai saat jadwal sudah tersedia.</span></div>{canEdit && <button className="button button-soft button-sm" onClick={onEditInfo}>Atur periode</button>}</div>}
    <section className="card campaign-big-message">
      {presentation.bigMessage ? <><div className="campaign-card-row"><div className="campaign-subheading">PESAN UTAMA CAMPAIGN</div><PresentationBadge /></div>{presentation.tagline && <span className="campaign-tagline">{presentation.tagline}</span>}<h2>{presentation.bigMessage}</h2><p>{presentation.intro || campaign.objective || "Gambaran umum belum dilengkapi."}</p><div className="campaign-big-meta"><span><Icon name="calendar" size={13} />{campaign.period}</span><span><Icon name="target" size={13} />{presentation.kpis.length + (hasStoredKpi ? 1 : 0)} target KPI</span><span><Icon name="users" size={13} />{teamNames.length} anggota terlibat</span></div></> : <EmptyCampaignState icon="book" title="Brief belum dibuat" description={campaign.objective ? `Tujuan singkat: ${campaign.objective}` : "Lengkapi brief agar seluruh anggota tim memiliki arah komunikasi yang sama."} action={canEdit ? <button className="button button-soft button-sm" onClick={onEditBrief}><Icon name="edit" size={13} />Tambah brief</button> : undefined} />}
    </section>

    <section className="campaign-stat-grid">
      <CampaignStatCard icon="check-square" label="Progres tugas" value={tasks.length ? `${completedTasks}/${tasks.length}` : "Belum ada"} note={tasks.length ? `${taskProgress}% tugas selesai` : "Progress belum dihitung"} tone="green" />
      <CampaignStatCard icon="target" label="Target KPI" value={kpiCount ? `${kpiCount}` : "Belum ada"} note={kpiCount ? `${kpiCount} target tersimpan` : "Tambahkan target KPI"} />
      <CampaignStatCard icon="wallet" label="Penggunaan budget" value={hasBudgetData ? `${budgetProgress}%` : "Belum diatur"} note={hasBudgetData ? `${rupiah(campaign.spent)} tersimpan` : "Atur di tab Keuangan"} tone="amber" />
      <CampaignStatCard icon="film" label="Konten & KOL" value={linkedInfluencerCount ? `${linkedInfluencerCount}` : "Belum ada"} note={linkedInfluencerCount ? "Jadwal influencer terhubung" : "Tambahkan konten atau KOL"} tone="blue" />
    </section>

    <div className="campaign-overview-grid">
      <div className="campaign-tab-stack">
        <section className="card">
          <CampaignSectionHeader icon="calendar" title="Fase campaign" description={presentation.phaseMode ? "Fase aktif berdasarkan draf tampilan." : "Campaign berjalan tanpa pengelompokan fase."} action={<button className="button button-soft button-sm" onClick={() => onOpenTab("timeline")}>Lihat timeline <Icon name="arrow-right" size={12} /></button>} />
          {presentation.phaseMode && activePhase ? <div className="campaign-active-phase"><span className="campaign-phase-number">01</span><div><StatusPill status={activePhase.status} /><h3>{activePhase.name}</h3><p>{activePhase.period} · {activePhase.purpose}</p></div><PresentationBadge /></div> : <IntegrationNotice>Fase bersifat opsional. Saat ini tugas ditampilkan langsung tanpa fase.</IntegrationNotice>}
        </section>
        <section className="card">
          <CampaignSectionHeader icon="target" title="Target & KPI" description="Progress KPI dipisahkan dari progres tugas." action={canEdit ? <button className="button button-soft button-sm" onClick={onAddKpi}><Icon name="plus" size={12} />Tambah KPI</button> : undefined} />
          {hasStoredKpi ? <CampaignKpiRow name="Target utama tersimpan" valueLabel={campaign.kpi} source="Sumber: field KPI Campaign existing" /> : <EmptyCampaignState icon="target" title="Belum ada target KPI" description="Tambahkan target yang terukur agar progres campaign dapat dievaluasi." action={canEdit ? <button className="button button-soft button-sm" onClick={onAddKpi}><Icon name="plus" size={12} />Tambah KPI</button> : undefined} />}
          {presentation.kpis.slice(0, 2).map((kpi) => <CampaignKpiRow key={kpi.id} name={kpi.name} valueLabel={`${formatUnit(kpi.current, kpi.unit)} / ${formatUnit(kpi.target, kpi.unit)}`} progress={(kpi.current / kpi.target) * 100} source="Draf tampilan sementara" />)}
        </section>
        <section className="card">
          <CampaignSectionHeader icon="check-square" title="Prioritas pekerjaan" description="Tugas diambil langsung dari modul To-Do." action={<button className="button button-soft button-sm" onClick={() => onOpenTab("timeline")}>Semua tugas <Icon name="arrow-right" size={12} /></button>} />
          {pendingTasks.length ? pendingTasks.slice(0, 3).map((task) => <CampaignTaskRow key={task.id} task={task} readOnly={!canEdit} onToggle={() => onToggleTask(task.id)} />) : <EmptyCampaignState icon="check-square" title={tasks.length ? "Semua tugas sudah selesai" : "Belum ada tugas"} description={tasks.length ? "Tidak ada pekerjaan tertunda pada campaign ini." : "Tambahkan tugas dari tab Timeline & Tugas agar pekerjaan memiliki PIC dan tenggat."} action={canEdit && !tasks.length ? <button className="button button-soft button-sm" onClick={() => onOpenTab("timeline")}><Icon name="plus" size={12} />Buat tugas pertama</button> : undefined} />}
        </section>
      </div>

      <aside className="campaign-tab-stack">
        <section className="card">
          <CampaignSectionHeader icon="campaign" title="Promo utama" action={canEdit ? <button className="button button-soft button-sm" onClick={onAddPromo}><Icon name="plus" size={12} />Tambah</button> : undefined} />
          {presentation.promos.length ? presentation.promos.slice(0, 2).map((promo) => <PromoCard key={promo.id} promo={promo} />) : <EmptyCampaignState icon="campaign" title="Promo belum disusun" description="Tambahkan periode dan mekanisme promo." />}
        </section>
        <section className="card">
          <CampaignSectionHeader icon="users" title="Tim campaign" description={`${teamNames.length} orang terlibat sebagai PIC tugas.`} />
          {teamNames.length ? <div className="campaign-team-list">{teamNames.map((name, index) => <div key={name}><Avatar name={name} tone={index % 3 === 1 ? "green" : index % 3 === 2 ? "orange" : "purple"} /><span><strong>{name}</strong><small>PIC tugas</small></span></div>)}</div> : <EmptyCampaignState icon="users" title="Belum ada anggota terlibat" description="Tim akan muncul setelah tugas memiliki PIC." />}
          <div className="campaign-divider" />
          <div className="campaign-subheading">KONFIRMASI BRIEF</div>
          <p className="campaign-body-copy">Konfirmasi ini hanya disimpan pada sesi tampilan sampai tabel acknowledgment tersedia.</p>
          <button className={`button ${presentation.acknowledged ? "button-soft" : "button-primary"} campaign-full-button`} onClick={onAcknowledge} disabled={!canEdit}><Icon name="check" size={13} />{presentation.acknowledged ? "Sudah dibaca · Batalkan" : canEdit ? "Saya sudah membaca brief" : "Akses baca saja"}</button>
        </section>
        <section className="card">
          <CampaignSectionHeader icon="clock" title="Aktivitas terbaru" description="Activity log backend belum tersedia." />
          <EmptyCampaignState icon="clock" title="Belum ada riwayat terhubung" description="Perubahan tugas tetap tersimpan, tetapi belum memiliki audit trail Campaign." />
        </section>
      </aside>
    </div>
  </div>;
}

function BriefPromoTab({ campaign, presentation, canEdit, referenceSync, onEditBrief, onAddPromo, onAddReference }: { campaign: Campaign; presentation: PresentationState; canEdit: boolean; referenceSync: "idle" | "loading" | "error"; onEditBrief: () => void; onAddPromo: () => void; onAddReference: () => void }) {
  const hasBrief = Boolean(presentation.bigMessage || presentation.intro || presentation.tagline);
  const hasStoredKpi = Boolean(campaign.kpi && campaign.kpi !== "Belum ditentukan");
  return <div className="campaign-tab-stack">
    <div className="campaign-section-intro"><div><h2>Brief campaign</h2><p>Susun konteks campaign agar tim dapat bekerja tanpa instruksi yang tersebar.</p></div><PresentationBadge>Belum tersimpan ke backend</PresentationBadge></div>
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
          {presentation.instructions ? <div className="campaign-important-note"><Icon name="alert" size={15} /><p>{presentation.instructions}</p><PresentationBadge /></div> : <EmptyCampaignState icon="pin" title="Belum ada instruksi khusus" description="Gunakan bagian ini untuk syarat promo, batasan copy, atau detail yang wajib dikonfirmasi." />}
        </section>
      </div>

      <aside className="card campaign-promo-column">
        <CampaignSectionHeader icon="campaign" title="Promo & mekanisme" description="Periode, manfaat, kuota, syarat, dan status persetujuan." action={canEdit ? <button className="button button-primary button-sm" onClick={onAddPromo}><Icon name="plus" size={12} />Tambah promo</button> : undefined} />
        {presentation.promos.length ? presentation.promos.map((promo) => <PromoCard key={promo.id} promo={promo} />) : <EmptyCampaignState icon="campaign" title="Belum ada promo terstruktur" description="Tambahkan draf promo untuk mereview periode dan mekanismenya." />}
      </aside>
    </div>
  </div>;
}

function TimelineTasksTab({ campaign, tasks, presentation, selectedPhaseId, taskView, canEdit, onTaskView, onSelectPhase, onAssignTaskPhase, onTogglePhaseMode, onAddPhase, onAddTask, onToggleTask }: { campaign: Campaign; tasks: Task[]; presentation: PresentationState; selectedPhaseId: string; taskView: "phase" | "all"; canEdit: boolean; onTaskView: (view: "phase" | "all") => void; onSelectPhase: (id: string) => void; onAssignTaskPhase: (taskId: EntityId, phaseId: string) => void; onTogglePhaseMode: () => void; onAddPhase: () => void; onAddTask: () => void; onToggleTask: (id: EntityId) => void }) {
  const selectedPhase = presentation.phases.find((phase) => phase.id === selectedPhaseId);
  const visibleTasks = !presentation.phaseMode || taskView === "all" ? tasks : tasks.filter((task) => presentation.taskPhase[entityKey(task.id)] === selectedPhaseId);
  return <div className="campaign-tab-stack">
    <div className="campaign-section-intro campaign-timeline-intro"><div><h2>Timeline & eksekusi</h2><p>Campaign kecil dapat berjalan tanpa fase. Semua tugas tetap memakai data yang sama dengan modul To-Do.</p></div><div className="campaign-detail-actions"><button className="button button-soft" onClick={onTogglePhaseMode} disabled={!canEdit}><Icon name="layers" size={14} />{presentation.phaseMode ? "Gunakan tanpa fase" : "Aktifkan fase"}</button><button className="button button-primary" onClick={onAddTask} disabled={!canEdit}><Icon name="plus" size={14} />Tambah tugas</button></div></div>
    <IntegrationNotice><strong>{presentation.phaseMode ? "Mode fase aktif." : "Mode tanpa fase aktif."}</strong> Pengaturan fase masih berupa state presentasi. Tugas baru tetap disimpan ke Campaign “{campaign.name}”.</IntegrationNotice>

    {presentation.phaseMode ? <div className="campaign-phase-layout">
      <aside className="card campaign-phase-sidebar">
        <CampaignSectionHeader icon="calendar" title="Fase campaign" description={`${presentation.phases.length} fase pada draf tampilan.`} action={canEdit ? <button className="icon-button" onClick={onAddPhase} aria-label="Tambah fase"><Icon name="plus" size={15} /></button> : undefined} />
        {presentation.phases.length ? presentation.phases.map((phase, index) => <PhaseCard key={phase.id} phase={phase} index={index} selected={phase.id === selectedPhaseId} taskCount={tasks.filter((task) => presentation.taskPhase[entityKey(task.id)] === phase.id).length} onSelect={() => onSelectPhase(phase.id)} />) : <EmptyCampaignState icon="layers" title="Belum ada fase" description="Tambahkan fase pertama atau kembali gunakan daftar tugas tanpa fase." action={<button className="button button-soft button-sm" onClick={onAddPhase}><Icon name="plus" size={12} />Tambah fase</button>} />}
        {tasks.some((task) => !presentation.taskPhase[entityKey(task.id)]) && <div className="campaign-unassigned-count"><Icon name="info" size={13} />{tasks.filter((task) => !presentation.taskPhase[entityKey(task.id)]).length} tugas existing belum dikelompokkan.</div>}
      </aside>
      <section className="card campaign-phase-tasks">
        <div className="campaign-section-header"><div><h2><Icon name="check-square" size={16} />Daftar pekerjaan</h2><p>{taskView === "phase" ? "Tugas pada fase terpilih." : "Semua tugas lintas fase."}</p></div><div className="campaign-segmented"><button className={taskView === "phase" ? "active" : ""} onClick={() => onTaskView("phase")}>Per fase</button><button className={taskView === "all" ? "active" : ""} onClick={() => onTaskView("all")}>Semua tugas</button></div></div>
        {taskView === "phase" && selectedPhase && <div className="campaign-phase-summary"><div className="campaign-subheading">FASE TERPILIH</div><h3>{selectedPhase.name}</h3><span>{selectedPhase.period}</span><p>{selectedPhase.purpose}</p></div>}
        {taskView === "phase" && !selectedPhase ? <EmptyCampaignState icon="layers" title="Pilih atau buat fase" description="Tugas akan muncul setelah sebuah fase dipilih." /> : visibleTasks.length ? visibleTasks.map((task) => <CampaignTaskRow key={task.id} task={task} phaseName={presentation.phases.find((phase) => phase.id === presentation.taskPhase[entityKey(task.id)])?.name} phaseOptions={presentation.phases} phaseId={presentation.taskPhase[entityKey(task.id)] || ""} onPhaseChange={(phaseId) => onAssignTaskPhase(task.id, phaseId)} readOnly={!canEdit} onToggle={() => onToggleTask(task.id)} />) : <EmptyCampaignState icon="check-square" title="Belum ada tugas pada fase ini" description="Tambahkan tugas baru dan pilih fase yang sesuai." action={canEdit ? <button className="button button-soft button-sm" onClick={onAddTask}><Icon name="plus" size={12} />Tambah tugas</button> : undefined} />}
      </section>
    </div> : <section className="card">
      <CampaignSectionHeader icon="check-square" title="Semua tugas campaign" description="Urutkan pekerjaan berdasarkan status, PIC, dan deadline tanpa pengelompokan fase." action={canEdit ? <button className="button button-primary button-sm" onClick={onAddTask}><Icon name="plus" size={12} />Tambah tugas</button> : undefined} />
      {tasks.length ? tasks.map((task) => <CampaignTaskRow key={task.id} task={task} readOnly={!canEdit} onToggle={() => onToggleTask(task.id)} />) : <EmptyCampaignState icon="check-square" title="Belum ada tugas campaign" description="Tugas yang dibuat di sini akan langsung muncul pada modul To-Do." action={canEdit ? <button className="button button-soft button-sm" onClick={onAddTask}><Icon name="plus" size={12} />Buat tugas pertama</button> : undefined} />}
    </section>}
  </div>;
}

function ContentInfluencerTab({ linkedInfluencers, brandContent, filter, onFilter, onNavigate }: { linkedInfluencers: AppData["influencerSchedules"]; brandContent: AppData["content"]; filter: "all" | "internal" | "influencer"; onFilter: (filter: "all" | "internal" | "influencer") => void; onNavigate: (view: string) => void }) {
  const showInfluencers = filter === "all" || filter === "influencer";
  const showInternal = filter === "all" || filter === "internal";
  return <div className="campaign-tab-stack">
    <div className="campaign-section-intro"><div><h2>Produksi konten & influencer</h2><p>Jadwal influencer sudah dapat difilter berdasarkan Campaign. Konten kalender belum memiliki relasi Campaign.</p></div><div className="campaign-detail-actions"><button className="button button-soft" onClick={() => onNavigate("calendar")}><Icon name="calendar" size={14} />Kalender konten</button><button className="button button-primary" onClick={() => onNavigate("influencer-schedule")}><Icon name="users" size={14} />Jadwal influencer</button></div></div>
    <div className="campaign-content-layout">
      <section className="card">
        <CampaignSectionHeader icon="film" title="Daftar brief & publikasi" description="Data aktual dari modul existing, dengan status relasi yang jelas." action={<div className="campaign-segmented"><button className={filter === "all" ? "active" : ""} onClick={() => onFilter("all")}>Semua</button><button className={filter === "internal" ? "active" : ""} onClick={() => onFilter("internal")}>Internal</button><button className={filter === "influencer" ? "active" : ""} onClick={() => onFilter("influencer")}>Influencer</button></div>} />
        {showInfluencers && linkedInfluencers.map((item) => <InfluencerBriefCard key={item.id} item={item} />)}
        {showInternal && brandContent.map((item) => <article className="campaign-content-card unlinked" key={item.id}><div className="campaign-content-icon"><Icon name="film" size={18} /></div><div className="campaign-content-copy"><div className="campaign-card-row"><strong>{item.title}</strong><StatusPill status={item.status} /></div><p>{item.platform} · {item.scheduledAt || `Tanggal ${item.date}`}</p><div className="campaign-content-details"><span><b>Caption / brief</b>{item.caption || "Belum tersedia."}</span></div><small><Icon name="alert" size={11} /> Konten satu brand — belum terhubung ke Campaign</small></div></article>)}
        {(!showInfluencers || linkedInfluencers.length === 0) && (!showInternal || brandContent.length === 0) && <EmptyCampaignState icon="film" title="Belum ada konten pada filter ini" description="Hubungkan konten atau jadwal influencer melalui Campaign ID pada tahap integrasi backend." />}
      </section>
      <aside className="campaign-tab-stack">
        <section className="card"><CampaignSectionHeader icon="check-square" title="Standar content brief" /><div className="campaign-checklist"><span><Icon name="circle" size={13} />Tujuan konten</span><span><Icon name="circle" size={13} />Point wajib</span><span><Icon name="circle" size={13} />CTA</span><span><Icon name="circle" size={13} />Jadwal upload</span><span><Icon name="circle" size={13} />URL hasil publikasi</span></div><p className="campaign-muted-copy">Daftar ini adalah panduan kelengkapan, bukan status aktual, karena field belum tersedia pada `social_posts`.</p></section>
        <IntegrationNotice tone="amber">Konten satu brand ditampilkan sebagai kandidat dan tidak dihitung sebagai konten Campaign sampai tersedia relasi `campaign_id`.</IntegrationNotice>
      </aside>
    </div>
  </div>;
}

function FinanceTab({ campaign, transactionCandidates, onNavigate }: { campaign: Campaign; transactionCandidates: AppData["transactions"]; onNavigate: (view: string) => void }) {
  const remaining = Math.max(campaign.budget - campaign.spent, 0);
  const percentage = campaign.budget ? Math.round((campaign.spent / campaign.budget) * 100) : 0;
  if (!campaign.budget && !campaign.spent) return <div className="campaign-tab-stack"><div className="campaign-section-intro"><div><h2>Budget campaign</h2><p>Rencana anggaran dan realisasi dapat dilengkapi setelah Campaign dibuat.</p></div></div><section className="card"><EmptyCampaignState icon="wallet" title="Budget belum ditentukan" description="Atur rencana dan transaksi Campaign melalui modul Mitra & Keuangan." action={<button className="button button-primary" onClick={() => onNavigate("partners")}><Icon name="external" size={14} />Atur budget</button>} /></section></div>;
  return <div className="campaign-tab-stack">
    <div className="campaign-section-intro"><div><h2>Budget campaign</h2><p>Ringkasan menggunakan budget dan spent yang sudah tersimpan pada Campaign.</p></div><button className="button button-primary" onClick={() => onNavigate("partners")}><Icon name="external" size={14} />Buka Mitra & Keuangan</button></div>
    <section className="campaign-stat-grid"><CampaignStatCard icon="wallet" label="Total anggaran" value={rupiah(campaign.budget)} note="Pagu tersimpan di Campaign" /><CampaignStatCard icon="chart" label="Realisasi" value={rupiah(campaign.spent)} note="Kolom spent Campaign existing" tone="amber" /><CampaignStatCard icon="wallet" label="Sisa anggaran" value={rupiah(remaining)} note="Budget dikurangi spent" tone="green" /><CampaignStatCard icon="target" label="Persentase terpakai" value={`${percentage}%`} note="Belum berasal dari transaksi" tone="blue" /></section>
    <div className="campaign-finance-grid">
      <div className="campaign-tab-stack">
        <section className="card"><CampaignSectionHeader icon="chart" title="Penggunaan budget" description="Tidak mencampur transaksi satu brand ke realisasi Campaign." /><BudgetProgress budget={campaign.budget} spent={campaign.spent} /><IntegrationNotice tone="amber">Realisasi masih memakai `campaigns.spent`. Setelah integrasi database, nilai ini harus dihitung dari transaksi yang memiliki Campaign ID.</IntegrationNotice></section>
        <section className="card"><CampaignSectionHeader icon="wallet" title="Pengeluaran per kategori" description="Breakdown belum tersedia karena transaksi belum memiliki Campaign ID." /><EmptyCampaignState icon="chart" title="Belum ada breakdown terpercaya" description="Kategori tidak ditampilkan sebagai realisasi Campaign agar data satu brand tidak salah diklaim." /></section>
      </div>
      <aside className="card">
        <CampaignSectionHeader icon="info" title="Transaksi satu brand" description={`${transactionCandidates.length} transaksi ${campaign.brand} belum terhubung ke Campaign.`} />
        {transactionCandidates.length ? <div className="campaign-transaction-list">{transactionCandidates.slice(0, 6).map((item, index) => <div key={item.id || `${item.vendor}-${item.date}-${index}`}><span><strong>{item.vendor}</strong><small>{item.category} · {formatTransactionDate(item.date)}</small></span><span><strong>{rupiah(item.amount)}</strong><StatusPill status={item.status} /></span></div>)}</div> : <EmptyCampaignState icon="wallet" title="Belum ada transaksi satu brand" description="Catat transaksi dari modul Mitra & Keuangan." />}
        <IntegrationNotice>Daftar ini hanya kandidat berdasarkan brand dan tidak dijumlahkan ke Campaign.</IntegrationNotice>
      </aside>
    </div>
  </div>;
}

function DiscussionTab({ identity, presentation, replyTo, canEdit, onReply, onUpdate, notify }: { identity?: UserIdentity; presentation: PresentationState; replyTo?: string; canEdit: boolean; onReply: (id?: string) => void; onUpdate: (update: (current: PresentationState) => PresentationState) => void; notify: (message: string) => void }) {
  const [filter, setFilter] = useState<"all" | "pinned">("all");
  const visibleNotes = filter === "pinned" ? presentation.notes.filter((note) => note.pinned) : presentation.notes;
  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const body = String(values.get("message") || "").trim();
    if (!canEdit) return notify("Akun Viewer memiliki akses baca saja pada diskusi Campaign.");
    if (!body) return notify("Tulis catatan terlebih dahulu.");
    const note: CampaignNoteItem = { id: globalThis.crypto.randomUUID(), author: identity?.name || "Anggota tim", body, createdAt: new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta", timeZoneName: "short" }).format(new Date()), pinned: false, replyTo };
    onUpdate((current) => ({ ...current, notes: [...current.notes, note] }));
    onReply(undefined);
    form.reset();
    notify("Catatan ditambahkan untuk sesi tampilan ini.");
  };
  const togglePin = (id: string) => onUpdate((current) => ({ ...current, notes: current.notes.map((note) => note.id === id ? { ...note, pinned: !note.pinned } : note) }));
  return <div className="campaign-tab-stack">
    <div className="campaign-section-intro"><div><h2>Diskusi & catatan campaign</h2><p>{canEdit ? "Anggota tim dapat memberi masukan." : "Akun Viewer dapat membaca diskusi tanpa mengubahnya."} Penyimpanan backend dan realtime belum tersedia.</p></div><PresentationBadge>State sesi browser</PresentationBadge></div>
    {!canEdit && <IntegrationNotice tone="amber">Akses Campaign untuk akun ini bersifat baca saja. Balasan, pin, dan konfirmasi brief dinonaktifkan.</IntegrationNotice>}
    <div className="campaign-discussion-grid">
      <section className="card campaign-discussion-main">
        <CampaignSectionHeader icon="message" title="Ruang diskusi" description={`${presentation.notes.length} catatan pada sesi ini.`} action={<div className="campaign-segmented"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Semua</button><button className={filter === "pinned" ? "active" : ""} onClick={() => setFilter("pinned")}>Dipin</button></div>} />
        <div className="campaign-note-list">{visibleNotes.length ? visibleNotes.map((note) => <CampaignNote key={note.id} note={note} readOnly={!canEdit} onReply={() => onReply(note.id)} onPin={() => togglePin(note.id)} />) : <EmptyCampaignState icon="message" title={filter === "pinned" ? "Belum ada catatan yang dipin" : "Belum ada diskusi"} description="Mulai dengan pertanyaan, keputusan, atau update pekerjaan yang perlu diketahui tim." />}</div>
        <div className="campaign-divider" />
        <form onSubmit={send} className="campaign-note-form">
          <div className="campaign-card-row"><strong>{replyTo ? "Tulis balasan" : "Tulis catatan"}</strong>{replyTo ? <button type="button" onClick={() => onReply(undefined)}>Batalkan balasan ×</button> : <span>Belum tersimpan ke backend</span>}</div>
          <textarea className="textarea" name="message" required maxLength={4000} disabled={!canEdit} placeholder={canEdit ? "Tulis masukan, pertanyaan, keputusan, atau update pekerjaan..." : "Akses baca saja"} onKeyDown={(event) => { if (event.ctrlKey && event.key === "Enter") event.currentTarget.form?.requestSubmit(); }} />
          <div className="campaign-note-footer"><button type="button" className="button button-ghost" disabled={!canEdit} onClick={() => notify("Lampiran membutuhkan penyimpanan backend Campaign.")}><Icon name="paperclip" size={13} />Lampiran</button><span>Maks. 4.000 karakter · Ctrl + Enter untuk kirim</span><button type="submit" className="button button-primary" disabled={!canEdit}><Icon name="send" size={13} />Kirim catatan</button></div>
        </form>
      </section>
      <aside className="campaign-tab-stack">
        <section className="card"><CampaignSectionHeader icon="pin" title="Catatan penting" />{presentation.notes.filter((note) => note.pinned).length ? presentation.notes.filter((note) => note.pinned).map((note) => <div className="campaign-pinned-note" key={note.id}><strong>{note.author}</strong><p>{note.body}</p><small>{note.createdAt}</small></div>) : <EmptyCampaignState icon="pin" title="Belum ada catatan penting" description="Pin keputusan atau instruksi agar mudah ditemukan tim." />}</section>
        <section className="card"><CampaignSectionHeader icon="clock" title="Riwayat perubahan" description="Memerlukan activity log backend." /><EmptyCampaignState icon="clock" title="Belum tersedia" description="Aktivitas akan dicatat otomatis setelah integrasi database." /></section>
        <section className="card"><CampaignSectionHeader icon="check" title="Konfirmasi brief" /><p className="campaign-body-copy">Tanda baca ini hanya berlaku pada sesi tampilan UI.</p><button className={`button ${presentation.acknowledged ? "button-soft" : "button-primary"} campaign-full-button`} disabled={!canEdit} onClick={() => onUpdate((current) => ({ ...current, acknowledged: !current.acknowledged }))}><Icon name="check" size={13} />{presentation.acknowledged ? "Sudah dibaca ✓" : canEdit ? "Tandai sudah dibaca" : "Akses baca saja"}</button></section>
      </aside>
    </div>
  </div>;
}

function CampaignDialog({ type, campaign, data, presentation, error, onClose, onSubmit, onUploadImage }: { type: CampaignDialogType; campaign: Campaign; data: AppData; presentation: PresentationState; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onUploadImage?: (file: File) => Promise<string> }) {
  const dialogRef = useRef<HTMLElement>(null);
  const [pasteStatus, setPasteStatus] = useState("");
  const info: Record<CampaignDialogType, { title: string; description: string }> = {
    info: { title: "Edit informasi Campaign", description: "Perbarui informasi dasar tanpa mengubah PIC tugas atau data operasional lain." },
    brief: { title: "Lengkapi brief campaign", description: "Draf ini hanya dipakai untuk review UI dan belum disimpan ke Supabase." },
    kpi: { title: "Tambah KPI", description: "Gunakan target numerik agar progres dapat dibaca dengan jelas." },
    promo: { title: "Tambah promo", description: "Lengkapi periode dan mekanisme agar tidak menimbulkan interpretasi berbeda." },
    phase: { title: "Tambah fase", description: "Fase bersifat opsional dan sementara belum tersimpan ke backend." },
    task: { title: "Tambah tugas campaign", description: "Tugas akan disimpan pada sumber data To-Do yang sudah ada." },
    reference: { title: "Tambah referensi kreatif", description: "Gunakan URL gambar, moodboard, atau dokumen acuan." },
  };

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialogNode = dialogRef.current;
    dialogNode?.querySelector<HTMLElement>("input:not([disabled]), textarea:not([disabled]), select:not([disabled])")?.focus();
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogNode) return;
      const focusable = Array.from(dialogNode.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]'));
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
  }, [onClose]);

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

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="modal campaign-detail-modal" role="dialog" aria-modal="true" aria-labelledby="campaign-dialog-title" aria-describedby="campaign-dialog-description">
      <div className="modal-head"><div><h2 id="campaign-dialog-title">{info[type].title}</h2><p id="campaign-dialog-description">{info[type].description}</p></div><button type="button" className="icon-button modal-close" onClick={onClose} aria-label="Tutup"><Icon name="close" /></button></div>
      <form onSubmit={onSubmit} onPaste={handlePaste} className="form-stack">
        {type === "info" && <><Field label="Nama Campaign" name="name" required defaultValue={campaign.name} placeholder="Contoh: Grand Opening RUMA Purwokerto" /><Select label="Brand" name="brand" values={campaignBrands(data, campaign.brand)} defaultValue={campaign.brand} required /><div className="campaign-form-group"><div><strong>Periode Campaign</strong><span>Opsional, kosongkan bila belum ditentukan.</span></div><div className="two-fields"><Field label="Tanggal mulai" name="startDate" type="date" defaultValue={campaign.startDate || ""} /><Field label="Tanggal selesai" name="endDate" type="date" defaultValue={campaign.endDate || ""} min={campaign.startDate || undefined} /></div></div><TextArea label="Tujuan Singkat" name="objective" defaultValue={campaign.objective} placeholder="Apa tujuan utama campaign ini?" /></>}
        {type === "brief" && <><Field label="Tagline" name="tagline" defaultValue={presentation.tagline} placeholder="Contoh: Make it Machiro" /><TextArea label="Big message" name="bigMessage" required defaultValue={presentation.bigMessage} placeholder="Pesan utama yang harus dipahami audiens" /><TextArea label="Gambaran umum" name="intro" defaultValue={presentation.intro} placeholder="Latar belakang, tujuan, dan fokus komunikasi" /><TextArea label="Alur pengerjaan" name="steps" defaultValue={presentation.steps.join("\n")} placeholder="Satu langkah per baris" /><TextArea label="Instruksi penting" name="instructions" defaultValue={presentation.instructions} placeholder="Syarat promo atau hal yang wajib dikonfirmasi" /></>}
        {type === "kpi" && <><Field label="Nama KPI" name="name" required placeholder="Contoh: Voucher redeem" /><div className="two-fields"><Field label="Realisasi" name="current" required type="number" min="0" /><Field label="Target" name="target" required type="number" min="0.01" step="any" /></div><Select label="Unit" name="unit" values={["Angka", "Persen", "Rupiah"]} /></>}
        {type === "promo" && <><Field label="Nama promo" name="title" required placeholder="Contoh: Diskon 30%" /><div className="campaign-form-group"><div><strong>Periode promo</strong><span>Pilih tanggal mulai dan selesai.</span></div><div className="two-fields"><Field label="Tanggal mulai" name="startDate" type="date" required /><Field label="Tanggal selesai" name="endDate" type="date" required /></div></div><TextArea label="Mekanisme & syarat" name="detail" placeholder="Kuota, eligibility, cara klaim, dan batasan (opsional)" /><div className="campaign-form-hint">Promo baru akan dibuat sebagai <strong>Draft</strong>. Status dapat diatur melalui aksi promo setelah workflow backend tersedia.</div></>}
        {type === "phase" && <><Field label="Nama fase" name="name" required placeholder="Contoh: Teaser" /><Field label="Periode" name="period" required placeholder="Contoh: 1–11 September" /><TextArea label="Tujuan fase" name="purpose" placeholder="Apa yang harus dicapai pada fase ini?" /><Select label="Status" name="status" values={["Rencana", "Berjalan", "Selesai"]} /></>}
        {type === "task" && <><Field label="Judul tugas" name="title" required placeholder="Contoh: Finalisasi key visual" /><div className="two-fields"><Select label="PIC" name="pic" values={data.users.length ? data.users.map((user) => user.name) : ["Belum ditentukan"]} /><Field label="Tenggat" name="due" type="date" required /></div><div className="two-fields"><Select label="Prioritas" name="priority" values={["Sedang", "Tinggi", "Rendah"]} />{presentation.phaseMode && presentation.phases.length > 0 && <Select label="Fase" name="phaseId" values={presentation.phases.map((phase) => phase.id)} labels={presentation.phases.map((phase) => phase.name)} />}</div></>}
        {type === "reference" && <><Field label="Judul referensi" name="title" required placeholder="Contoh: Moodboard visual" /><div className="campaign-form-group"><div><strong>Periode referensi</strong><span>Gunakan periode saat referensi dipakai dalam campaign.</span></div><div className="two-fields"><Field label="Tanggal mulai" name="startDate" type="date" required /><Field label="Tanggal selesai" name="endDate" type="date" required /></div></div><Field label="URL" name="url" required type="url" placeholder="https://..." /><Select label="Jenis" name="kind" values={["Link", "Gambar", "Dokumen"]} /><input type="hidden" name="mimeType" /><div className="campaign-reference-paste-note"><Icon name="image" size={16} /><span><strong>Tempel gambar langsung</strong><br />Salin gambar, lalu tekan Ctrl + V di form ini. {pasteStatus && <em>{pasteStatus}</em>}</span></div></>}
        {error && <div className="campaign-form-error" role="alert"><Icon name="alert" size={14} />{error}</div>}
        <div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>Batal</button><button type="submit" className="button button-primary">Simpan perubahan</button></div>
      </form>
    </section>
  </div>;
}

function Field({ label, name, required, type = "text", defaultValue, placeholder, min, step }: { label: string; name: string; required?: boolean; type?: string; defaultValue?: string; placeholder?: string; min?: string; step?: string }) {
  const id = `campaign-field-${name}`;
  return <div className="form-field"><label htmlFor={id}>{label}{required ? " *" : ""}</label><input id={id} className="modal-input" name={name} type={type} required={required} defaultValue={defaultValue} placeholder={placeholder} min={min} step={step} /></div>;
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
