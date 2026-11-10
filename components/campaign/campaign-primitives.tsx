import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AppData, Campaign, CampaignTimelinePhase, Task, UserIdentity } from "@/lib/types";
import { Avatar, Icon, TaskPriorityStar, rupiah, StatusPill } from "@/components/ui";
import { allowedTaskStatuses, isTaskManager, taskIsPriority, taskStatuses } from "@/lib/task-workflow";
import { datedPhase, phaseColor, phasePeriodLabel, phaseTimeState } from "@/lib/campaign-timeline";
import { formatCampaignPeriod } from "@/lib/campaign-form";
import { formatDisplayDate, formatDisplayDateRange, formatDisplayDateTime, formatTaskDeadline } from "@/lib/date-format";
import { displayInfluencerBookingStatus, displayInfluencerPaymentStatus, influencerBookingStatusTone, influencerPaymentStatusTone } from "@/lib/campaign-influencer";
import { canManageUsers } from "@/lib/user-management";
import { TaskAssigneeAvatars, TaskAssigneePicker } from "@/components/task-assignees";
import type { TaskStatus, User } from "@/lib/types";

export function PresentationBadge({ children = "Draf tampilan" }: { children?: ReactNode }) {
  return <span className="campaign-source-badge"><Icon name="info" size={12} />{children}</span>;
}

export function IntegrationNotice({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "amber" }) {
  return <div className={`campaign-integration-notice ${tone}`}><Icon name={tone === "amber" ? "alert" : "info"} size={15} /><div>{children}</div></div>;
}

export function EmptyCampaignState({ icon = "sparkles", title, description, action }: { icon?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="campaign-empty-state"><span className="campaign-empty-icon"><Icon name={icon} size={18} /></span><strong>{title}</strong>{description && <p>{description}</p>}{action}</div>;
}

export function CampaignAvatar({ src, fallbackSrc, initials }: { src?: string | null; fallbackSrc?: string | null; initials: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageUrl = src && failedUrl !== src ? src : fallbackSrc && failedUrl !== fallbackSrc ? fallbackSrc : null;
  if (!imageUrl) return <div className="campaign-brand campaign-avatar-fallback" aria-hidden="true">{initials}</div>;
  return <img className="campaign-avatar" src={imageUrl} alt="" onError={() => setFailedUrl(imageUrl)} />;
}

export function CampaignSectionHeader({ icon, title, description, action }: { icon: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="campaign-section-header"><div><h2><Icon name={icon} size={16} />{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

export function CampaignStatCard({ icon, label, value, note, tone = "purple" }: { icon: string; label: string; value: string; note: string; tone?: "purple" | "green" | "amber" | "blue" }) {
  return <div className="campaign-stat-card"><div className={`campaign-stat-icon ${tone}`}><Icon name={icon} size={15} /></div><span>{label}</span><strong>{value}</strong><p>{note}</p></div>;
}

export function CampaignKpiRow({ name, valueLabel, progress, source }: { name: string; valueLabel: string; progress?: number; source?: string }) {
  const safeProgress = progress === undefined ? undefined : Math.max(0, Math.min(progress, 100));
  return <div className="campaign-kpi-row"><div className="campaign-kpi-heading"><span>{name}</span><strong>{safeProgress === undefined ? "Target tersimpan" : `${Math.round(safeProgress)}%`}</strong></div>{safeProgress === undefined ? <div className="campaign-kpi-text-target">{valueLabel}</div> : <><div className="campaign-progress"><span style={{ width: `${safeProgress}%` }} /></div><div className="campaign-kpi-caption">{valueLabel}</div></>}{source && <small>{source}</small>}</div>;
}

export function BudgetProgress({ budget, spent, compact = false }: { budget: number; spent: number; compact?: boolean }) {
  const safeBudget = Math.max(0, budget);
  const safeSpent = Math.max(0, spent);
  const percentage = safeBudget ? Math.min((safeSpent / safeBudget) * 100, 100) : 0;
  return <div className={`campaign-budget-progress ${compact ? "compact" : ""}`}><div className="campaign-budget-top"><div><span>Realisasi tersimpan</span><strong>{rupiah(safeSpent)}</strong></div><div className="campaign-budget-right"><span>Dari anggaran</span><strong>{rupiah(safeBudget)}</strong></div></div><div className="campaign-progress amber"><span style={{ width: `${percentage}%` }} /></div><div className="campaign-budget-bottom"><span>{Math.round(percentage)}% terpakai</span><span>Sisa {rupiah(Math.max(safeBudget - safeSpent, 0))}</span></div></div>;
}

export type CampaignPromo = { id: string; title: string; period: string; startDate?: string; endDate?: string; summary?: string; detail: string; status: string; posterUrl?: string | null };

export function PromoCard({ promo, canEdit = false, canMoveUp = false, canMoveDown = false, onEdit, onDelete, onMoveUp, onMoveDown }: { promo: CampaignPromo; canEdit?: boolean; canMoveUp?: boolean; canMoveDown?: boolean; onEdit?: () => void; onDelete?: () => void; onMoveUp?: () => void; onMoveDown?: () => void }) {
  const showStatus = !["draf", "draft"].includes(promo.status.trim().toLowerCase());
  return <article className="campaign-promo-card"><div className="campaign-promo-heading"><h3>{promo.title}</h3>{canEdit && <div className="campaign-promo-actions">{onMoveUp && <button type="button" className="icon-button" onClick={onMoveUp} disabled={!canMoveUp} aria-label={`Pindahkan promo ${promo.title} ke atas`} title="Pindah ke atas"><Icon name="chevron-up" size={14} /></button>}{onMoveDown && <button type="button" className="icon-button" onClick={onMoveDown} disabled={!canMoveDown} aria-label={`Pindahkan promo ${promo.title} ke bawah`} title="Pindah ke bawah"><Icon name="chevron-down" size={14} /></button>}<button type="button" className="icon-button" onClick={onEdit} aria-label={`Edit promo ${promo.title}`} title="Edit promo"><Icon name="edit" size={13} /></button><button type="button" className="icon-button danger" onClick={onDelete} aria-label={`Hapus promo ${promo.title}`} title="Hapus promo"><Icon name="trash" size={13} /></button></div>}</div><div className="campaign-promo-meta">{showStatus && <StatusPill status={promo.status} />}<span>{promo.startDate || promo.endDate ? formatCampaignPeriod(promo.startDate, promo.endDate) : formatDisplayDateRange(promo.period)}</span></div>{promo.summary && <p>{promo.summary}</p>}{promo.posterUrl && <img className="campaign-promo-poster" src={promo.posterUrl} alt={`Poster promo ${promo.title}`} loading="lazy" />}<div className="campaign-promo-detail">{promo.detail}</div></article>;
}

export type CampaignPhase = CampaignTimelinePhase;

export function PhaseCard({ phase, index, selected, taskCount, today, onSelect, onEdit }: { phase: CampaignPhase; index: number; selected: boolean; taskCount: number; today: string; onSelect: () => void; onEdit?: () => void }) {
  const state = phaseTimeState(phase, today);
  return <div className={`campaign-phase-item ${selected ? "selected" : ""}`}><button type="button" className="campaign-phase-card" onClick={onSelect} aria-pressed={selected}><span className="campaign-phase-number" style={{ color: phaseColor(phase, index) }}>{String(index + 1).padStart(2, "0")}</span><span className="campaign-phase-copy"><strong>{phase.name}</strong><small>{phasePeriodLabel(phase)}</small><span>{taskCount} tugas</span><small className={state === "Sedang berlangsung" ? "phase-time-active" : ""}>{state}</small></span></button>{onEdit && <button type="button" className="phase-edit-button" onClick={onEdit} aria-label={`Edit fase ${phase.name}`}><Icon name="edit" size={12} />{datedPhase(phase) ? "Edit fase" : "Atur tanggal fase"}</button>}</div>;
}

export function CampaignTaskRow({ task, campaign, users = [], identity, onToggle, onStatusChange, onAssigneesChange, phaseName, phaseOptions = [], phaseId = "", onPhaseChange, onEdit, compact = false, readOnly = false }: { task: Task; campaign?: Campaign; users?: User[]; identity?: UserIdentity; onToggle: () => void; onStatusChange?: (status: TaskStatus) => void; onAssigneesChange?: (ids: string[]) => void | Promise<void>; phaseName?: string; phaseOptions?: CampaignPhase[]; phaseId?: string; onPhaseChange?: (id: string) => void; onEdit?: () => void; compact?: boolean; readOnly?: boolean }) {
  const done = task.status === "Done", manager = identity ? isTaskManager(identity) : !readOnly;
  const superAdmin = canManageUsers(identity);
  const allowed = readOnly ? [] : identity ? allowedTaskStatuses(task, users, identity) : taskStatuses;
  const options = Array.from(new Set([task.status, ...allowed]));
  return <div className={`campaign-task-row ${done ? "done" : ""} ${task.pendingStatusRequest ? "campaign-task-awaiting" : ""}`}>
    <button type="button" className="campaign-task-check" onClick={onToggle} disabled={readOnly || !manager || Boolean(task.pendingStatusRequest)} aria-label={done ? `Buka kembali ${task.title}` : `Tandai ${task.title} selesai`}><Icon name={done ? "check" : "circle"} size={13} /></button>
    <div className="campaign-task-copy"><strong>{task.title}</strong><p>{phaseName ? `${phaseName} · ` : ""}Deadline {formatTaskDeadline(task, campaign)}</p>{task.pendingStatusRequest && <small className="task-request-label">Menunggu persetujuan · {task.pendingStatusRequest.toStatus}</small>}</div>
    <TaskAssigneeAvatars task={task} users={users} />
    {manager && !superAdmin && !compact && <TaskAssigneePicker users={users} selectedIds={task.assigneeIds} legacyPic={task.pic} disabled={readOnly || !onAssigneesChange} name={`assigneeIds-${task.id}`} onSelectionChange={onAssigneesChange} />}
    {manager && !superAdmin && onPhaseChange && phaseOptions.length > 0 && <label className="campaign-task-phase"><span>Fase</span><select value={phaseId} onChange={(event) => onPhaseChange(event.target.value)} disabled={readOnly} aria-label={`Fase untuk ${task.title}`}><option value="">Tanpa fase</option>{phaseOptions.map((phase) => <option value={phase.id} key={phase.id}>{phase.name}</option>)}</select></label>}
    <TaskPriorityStar active={taskIsPriority(task)} />
    {onStatusChange && allowed.length ? <select className="campaign-task-status" value={task.status} onChange={(event) => onStatusChange(event.target.value as TaskStatus)} aria-label={`Status ${task.title}`}>{options.map((status) => <option key={status}>{status}</option>)}</select> : <StatusPill status={task.status} />}
    {onEdit && manager && !readOnly && <button type="button" className="button button-soft button-sm campaign-task-edit" onClick={onEdit} aria-label={`Edit ${task.title}`}><Icon name="edit" size={13} />Edit</button>}
  </div>;
}

export type CreativeReference = { id: string; title: string; url: string; kind: string; startDate?: string; endDate?: string; mimeType?: string; source?: "backend" | "presentation" };

export function CreativeReferenceCard({ reference, onDelete }: { reference: CreativeReference; onDelete?: () => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isImage = reference.kind === "Gambar" || reference.mimeType?.startsWith("image/");

  useEffect(() => {
    if (!previewOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false);
      if (event.key === "Tab") {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previewButtonRef.current?.focus();
    };
  }, [previewOpen]);

  return <>
    <article className="campaign-reference-card">
      {isImage ? <button ref={previewButtonRef} type="button" className="campaign-reference-preview" onClick={() => !imageFailed && setPreviewOpen(true)} disabled={imageFailed} aria-label="Lihat gambar referensi">
        {!imageFailed ? <img src={reference.url} alt="Gambar referensi" loading="lazy" onError={() => setImageFailed(true)} /> : <Icon name="image" size={24} />}
      </button> : <a className="campaign-reference-preview campaign-reference-link" href={reference.url} target="_blank" rel="noreferrer" aria-label="Buka referensi"><Icon name="link" size={24} /></a>}
      {onDelete && <button type="button" className="button button-ghost button-sm campaign-reference-delete" onClick={onDelete} aria-label="Hapus gambar referensi"><Icon name="trash" size={12} />Hapus</button>}
    </article>
    {previewOpen && <div className="campaign-reference-lightbox-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewOpen(false); }}>
      <section className="campaign-reference-lightbox" role="dialog" aria-modal="true" aria-label="Pratinjau gambar referensi">
        <button ref={closeButtonRef} type="button" className="campaign-reference-lightbox-close" onClick={() => setPreviewOpen(false)} aria-label="Tutup gambar"><Icon name="close" size={20} /></button>
        <img src={reference.url} alt="Gambar referensi ukuran penuh" />
      </section>
    </div>}
  </>;
}

export function InfluencerBriefCard({ item }: { item: AppData["influencerSchedules"][number] }) {
  const barter = item.collaborationType === "Barter Endorse";
  return <article className="campaign-content-card"><div className="campaign-content-icon influencer"><Icon name="users" size={18} /></div><div className="campaign-content-copy"><div className="campaign-card-row"><strong>{item.themeName || item.content}</strong><StatusPill status={displayInfluencerBookingStatus(item.status)} className={`campaign-influencer-status-pill cooperation-${influencerBookingStatusTone(item.status)}`} /></div><p>{item.platform} · {item.influencer} · Visit {formatDisplayDate(item.visitDate, { empty: "belum diatur" })} · Upload {formatDisplayDate(item.uploadDate === undefined ? item.date : item.uploadDate, { empty: "belum diatur" })}</p><div className="campaign-content-details"><span><b>{barter ? "Estimasi barter" : "Rate / spent"}</b>{barter ? rupiah(item.barterValue ?? 0) : `${rupiah(item.rate)} / ${rupiah(item.spent)}`}{item.rateCardNameSnapshot && <small>{item.rateCardNameSnapshot}{item.rateCardDetailsSnapshot ? ` · ${item.rateCardDetailsSnapshot}` : ""}</small>}</span><span><b>Pembayaran</b>{barter ? <strong>Tidak berlaku</strong> : <StatusPill status={displayInfluencerPaymentStatus(item.paymentStatus)} className={`campaign-influencer-status-pill payment-${influencerPaymentStatusTone(item.paymentStatus)}`} />}</span>{item.notes && <span><b>Catatan</b>{item.notes}</span>}</div><small>Sumber: booking influencer yang terhubung ke campaign</small></div></article>;
}

export type CampaignNoteItem = { id: string; author: string; body: string; createdAt: string; pinned: boolean; replyTo?: string };

export function CampaignNote({ note, onReply, onPin, readOnly = false, canPin = true }: { note: CampaignNoteItem; onReply: () => void; onPin: () => void; readOnly?: boolean; canPin?: boolean }) {
  return <article className="campaign-note"><Avatar name={note.author} /><div className="campaign-note-body"><div className="campaign-note-meta"><strong>{note.author}</strong><time>{formatDisplayDateTime(note.createdAt)}</time>{note.pinned && <span className="campaign-note-pin"><Icon name="pin" size={11} />Tampil di dashboard</span>}</div>{note.replyTo && <div className="campaign-note-reply">Membalas catatan sebelumnya</div>}<p>{note.body}</p>{!readOnly && <div className="campaign-note-actions"><button type="button" onClick={onReply}><Icon name="reply" size={12} />Balas</button>{canPin && <button type="button" onClick={onPin}><Icon name="pin" size={12} />{note.pinned ? "Lepas dari dashboard" : "Pin ke dashboard"}</button>}</div>}</div></article>;
}
