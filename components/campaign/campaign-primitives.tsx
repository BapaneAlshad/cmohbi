import { useState, type ReactNode } from "react";
import type { AppData, Task } from "@/lib/types";
import { Avatar, Icon, PriorityPill, rupiah, StatusPill } from "@/components/ui";
import { formatCampaignPeriod } from "@/lib/campaign-form";

export function PresentationBadge({ children = "Draf tampilan" }: { children?: ReactNode }) {
  return <span className="campaign-source-badge"><Icon name="info" size={12} />{children}</span>;
}

export function IntegrationNotice({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "amber" }) {
  return <div className={`campaign-integration-notice ${tone}`}><Icon name={tone === "amber" ? "alert" : "info"} size={15} /><div>{children}</div></div>;
}

export function EmptyCampaignState({ icon = "sparkles", title, description, action }: { icon?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="campaign-empty-state"><span className="campaign-empty-icon"><Icon name={icon} size={18} /></span><strong>{title}</strong><p>{description}</p>{action}</div>;
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

export type CampaignPromo = { id: string; title: string; period: string; startDate?: string; endDate?: string; summary?: string; detail: string; status: string };

export function PromoCard({ promo }: { promo: CampaignPromo }) {
  return <article className="campaign-promo-card"><div className="campaign-card-row"><StatusPill status={promo.status} /><span>{promo.period}</span></div><h3>{promo.title}</h3>{promo.summary && <p>{promo.summary}</p>}<div className="campaign-promo-detail">{promo.detail}</div><PresentationBadge /></article>;
}

export type CampaignPhase = { id: string; name: string; period: string; purpose: string; status: string };

export function PhaseCard({ phase, index, selected, taskCount, onSelect }: { phase: CampaignPhase; index: number; selected: boolean; taskCount: number; onSelect: () => void }) {
  return <button type="button" className={`campaign-phase-card ${selected ? "selected" : ""}`} onClick={onSelect}><span className="campaign-phase-number">{String(index + 1).padStart(2, "0")}</span><span className="campaign-phase-copy"><strong>{phase.name}</strong><small>{phase.period}</small><span>{taskCount} tugas</span></span><StatusPill status={phase.status} /></button>;
}

export function CampaignTaskRow({ task, onToggle, phaseName, phaseOptions = [], phaseId = "", onPhaseChange, readOnly = false }: { task: Task; onToggle: () => void; phaseName?: string; phaseOptions?: CampaignPhase[]; phaseId?: string; onPhaseChange?: (phaseId: string) => void; readOnly?: boolean }) {
  const done = task.status === "Done";
  return <div className={`campaign-task-row ${done ? "done" : ""}`}><button type="button" className="campaign-task-check" onClick={onToggle} disabled={readOnly} title={readOnly ? "Akses baca saja" : undefined} aria-label={done ? `Buka kembali ${task.title}` : `Tandai ${task.title} selesai`}><Icon name={done ? "check" : "circle"} size={13} /></button><div className="campaign-task-copy"><strong>{task.title}</strong><p>{phaseName ? `${phaseName} · ` : ""}{task.pic} · Tenggat {task.due}</p></div>{onPhaseChange && phaseOptions.length > 0 && <label className="campaign-task-phase"><span>Fase</span><select value={phaseId} onChange={(event) => onPhaseChange(event.target.value)} disabled={readOnly} aria-label={`Fase untuk ${task.title}`}><option value="">Tanpa fase</option>{phaseOptions.map((phase) => <option value={phase.id} key={phase.id}>{phase.name}</option>)}</select></label>}<PriorityPill priority={task.priority} /><StatusPill status={task.status} /></div>;
}

export type CreativeReference = { id: string; title: string; url: string; kind: string; startDate?: string; endDate?: string; mimeType?: string; source?: "backend" | "presentation" };

export function CreativeReferenceCard({ reference }: { reference: CreativeReference }) {
  const [imageFailed, setImageFailed] = useState(false);
  const isImage = reference.kind === "Gambar" || reference.mimeType?.startsWith("image/");
  return <a className="campaign-reference-card" href={reference.url} target="_blank" rel="noreferrer"><span className="campaign-reference-preview">{isImage && !imageFailed ? <img src={reference.url} alt={reference.title} loading="lazy" onError={() => setImageFailed(true)} /> : <Icon name={isImage ? "image" : "link"} size={24} />}</span><strong>{reference.title}</strong><small>{reference.kind} · {reference.startDate && reference.endDate ? `${formatCampaignPeriod(reference.startDate, reference.endDate)} · ` : ""}Buka referensi <Icon name="external" size={10} /></small>{reference.source !== "backend" && <PresentationBadge />}</a>;
}

export function InfluencerBriefCard({ item }: { item: AppData["influencerSchedules"][number] }) {
  return <article className="campaign-content-card"><div className="campaign-content-icon influencer"><Icon name="users" size={18} /></div><div className="campaign-content-copy"><div className="campaign-card-row"><strong>{item.content}</strong><StatusPill status={item.status} /></div><p>{item.platform} · {item.influencer} · {item.date} {item.time} WIB</p><div className="campaign-content-details"><span><b>Catatan</b>{item.notes || "Belum ada catatan brief."}</span><span><b>Pembayaran</b>{item.paymentStatus}</span></div><small>Sumber: Jadwal Influencer yang terhubung ke campaign</small></div></article>;
}

export type CampaignNoteItem = { id: string; author: string; body: string; createdAt: string; pinned: boolean; replyTo?: string };

export function CampaignNote({ note, onReply, onPin, readOnly = false }: { note: CampaignNoteItem; onReply: () => void; onPin: () => void; readOnly?: boolean }) {
  return <article className="campaign-note"><Avatar name={note.author} /><div className="campaign-note-body"><div className="campaign-note-meta"><strong>{note.author}</strong><time>{note.createdAt}</time>{note.pinned && <span className="campaign-note-pin"><Icon name="pin" size={11} />Dipin</span>}</div>{note.replyTo && <div className="campaign-note-reply">Membalas catatan sebelumnya</div>}<p>{note.body}</p>{!readOnly && <div className="campaign-note-actions"><button type="button" onClick={onReply}><Icon name="reply" size={12} />Balas</button><button type="button" onClick={onPin}><Icon name="pin" size={12} />{note.pinned ? "Lepas pin" : "Pin catatan"}</button></div>}</div></article>;
}
