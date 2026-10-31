"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AppData, Campaign, CampaignActivity, CampaignKpi, CampaignKpiInput, EntityId, UserIdentity } from "@/lib/types";
import { isTaskManager, taskIsPriority } from "@/lib/task-workflow";
import { kpiProgress, mergeCampaignActivities, myCampaignTasks, validateKpi, visibleCampaignActivities } from "@/lib/campaign-overview";
import { formatDisplayDateTime, formatTaskDeadline } from "@/lib/date-format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCampaignActivity, fetchCampaignKpis } from "@/lib/supabase/campaign-overview-data";
import { Icon, StatusPill, TaskPriorityStar } from "@/components/ui";
import { CampaignSectionHeader, EmptyCampaignState } from "./campaign-primitives";

const number = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);

export function CampaignOverviewTab({ campaign, data, identity, canManage, liveMode = false, workspaceId, onSaveKpi }: {
  campaign: Campaign; data: AppData; identity?: UserIdentity; canManage: boolean; liveMode?: boolean; workspaceId?: string;
  onSaveKpi: (campaignId: EntityId, input: CampaignKpiInput, id?: string) => Promise<void>;
}) {
  const [client] = useState(createSupabaseBrowserClient);
  const [remoteKpis, setRemoteKpis] = useState<CampaignKpi[]>([]);
  const [remoteHistory, setRemoteHistory] = useState<CampaignActivity[]>([]);
  const [kpiError, setKpiError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [loading, setLoading] = useState(liveMode);
  const [morePending, setMorePending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [revision, setRevision] = useState(0);
  const [editingKpi, setEditingKpi] = useState<CampaignKpi | null | undefined>();
  const tasks = data.tasks.filter((task) => String(task.campaign) === String(campaign.id));
  const myTasks = myCampaignTasks(tasks.filter((task) => isTaskManager(identity) || task.status !== "Backlog"), data.users, identity);
  const kpis = liveMode ? remoteKpis : (data.campaignKpis || []).filter((kpi) => String(kpi.campaignId) === String(campaign.id));
  const localHistory = mergeCampaignActivities(data.taskStatusHistory || [], data.influencerStatusHistory || [], campaign.id);
  const allHistory = liveMode ? remoteHistory : localHistory;
  const history = visibleCampaignActivities(allHistory, showAllHistory);
  const statusVersion = tasks.map((task) => `${task.id}:${task.status}`).join("|");
  const influencerStatusVersion = data.influencerSchedules.filter((item) => String(item.campaignId) === String(campaign.id) || item.campaign === campaign.name).map((item) => `${item.id}:${item.status}`).join("|");

  useEffect(() => {
    if (!liveMode || !client || !workspaceId) return;
    let active = true;
    setLoading(true);
    setShowAllHistory(false);
    void Promise.allSettled([fetchCampaignKpis(client, workspaceId, campaign.id), fetchCampaignActivity(client, workspaceId, campaign.id, 0, 6)]).then(([kpiResult, historyResult]) => {
      if (!active) return;
      if (kpiResult.status === "fulfilled") { setRemoteKpis(kpiResult.value); setKpiError(""); }
      else setKpiError(kpiResult.reason.message || "KPI belum dapat dimuat.");
      if (historyResult.status === "fulfilled") { setRemoteHistory(historyResult.value); setHasMore(historyResult.value.length > 5); setHistoryError(""); }
      else setHistoryError(historyResult.reason.message || "Aktivitas belum dapat dimuat.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [campaign.id, campaign.name, client, workspaceId, liveMode, revision, statusVersion, influencerStatusVersion]);

  const loadMore = async () => {
    if (!liveMode) { setShowAllHistory(true); return; }
    if (!client || !workspaceId || morePending) return;
    setMorePending(true);
    try {
      const next = [...remoteHistory];
      let offset = next.length;
      let page: CampaignActivity[];
      do {
        page = await fetchCampaignActivity(client, workspaceId, campaign.id, offset, 100);
        next.push(...page.filter((item) => !next.some((old) => old.id === item.id && old.kind === item.kind)));
        offset += page.length;
      } while (page.length === 100);
      setRemoteHistory(next); setHasMore(false); setShowAllHistory(true); setHistoryError("");
    } catch (error) { setHistoryError((error as Error).message); }
    finally { setMorePending(false); }
  };

  return <div className="campaign-overview-focus">
    <div className="campaign-overview-focus-grid">
      <section className="card campaign-my-tasks"><CampaignSectionHeader icon="check-square" title={`My Task (${myTasks.length})`} />
        {myTasks.length ? <ul className="campaign-my-task-list">{myTasks.map((task) => <li className={`campaign-my-task-row ${task.pendingStatusRequest ? "campaign-task-awaiting" : ""}`} key={String(task.id)}>
          <div className="campaign-my-task-heading"><TaskPriorityStar active={taskIsPriority(task)} /><strong>{task.title}</strong><StatusPill status={task.status} /></div>
          <p>Deadline {formatTaskDeadline(task, campaign)}</p>
          {task.pendingStatusRequest && <small className="task-request-label">Menunggu persetujuan · {task.pendingStatusRequest.toStatus}</small>}
        </li>)}</ul> : <EmptyCampaignState icon="check-square" title="Tidak ada tugas aktif untuk Anda di campaign ini." description="Pekerjaan akan muncul ketika Anda menjadi salah satu PIC." />}
      </section>
      <section className="card campaign-measurable-kpis"><CampaignSectionHeader icon="target" title="Target & KPI" description="Capaian campaign yang diperbarui secara manual" action={canManage && <button className="button button-soft button-sm" onClick={() => setEditingKpi(null)} disabled={loading || Boolean(kpiError)}><Icon name="plus" size={13} />Tambah KPI</button>} />
        {kpiError ? <div className="campaign-overview-load-error" role="alert">{kpiError}<button className="button button-soft button-sm" onClick={() => setRevision((value) => value + 1)}>Coba lagi</button></div> : loading ? <p className="campaign-muted-copy">Memuat KPI…</p> : kpis.length ? kpis.map((kpi) => {
          const progress = kpiProgress(kpi);
          return <article className="campaign-measurable-kpi" key={kpi.id}><header><strong>{kpi.name}</strong>{canManage && <button className="icon-button" aria-label={`Edit KPI ${kpi.name}`} onClick={() => setEditingKpi(kpi)}><Icon name="edit" size={14} /></button>}</header><div className="campaign-kpi-values"><span>{number(progress.achieved)} / {number(kpi.targetIncrease)} {kpi.unit}</span><strong>{number(progress.percentage)}%</strong></div><div className={`campaign-progress ${progress.achieved < 0 ? "declining" : ""}`} role="progressbar" aria-label={kpi.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.bar} aria-valuetext={`${number(progress.percentage)} persen; capaian ${number(progress.achieved)} dari ${number(kpi.targetIncrease)} ${kpi.unit}`}><span style={{ width: `${progress.bar}%` }} /></div><p>Awal {number(kpi.baseline)} · Sekarang {number(kpi.current)} {kpi.unit}{progress.percentage > 100 ? " · Melebihi target" : ""}</p></article>;
        }) : campaign.kpi && campaign.kpi !== "Belum ditentukan" ? <div className="campaign-legacy-kpi"><strong>{campaign.kpi}</strong><p>Target lama belum memiliki angka awal dan realisasi.</p>{canManage && <button className="button button-soft button-sm" onClick={() => setEditingKpi(null)}>Lengkapi angka KPI</button>}</div> : <EmptyCampaignState icon="target" title="Belum ada target KPI" description={canManage ? "Tambahkan target followers, penjualan, peserta, atau hasil lain yang ingin dicapai." : "Owner/admin dapat menambahkan target untuk campaign ini."} />}
      </section>
    </div>
    <section className="card campaign-status-activity"><CampaignSectionHeader icon="clock" title="Aktivitas terbaru" description="Perubahan status tugas dan jadwal influencer pada campaign ini" />
      {historyError && <div className="campaign-overview-load-error" role="alert">{historyError}<button className="button button-soft button-sm" onClick={() => setRevision((value) => value + 1)}>Coba lagi</button></div>}
      {loading ? <p className="campaign-muted-copy">Memuat aktivitas…</p> : history.length ? <div className="campaign-status-activity-list">{history.map((item) => <article key={`${item.kind}-${item.id}`}><span className="campaign-activity-marker"><Icon name={item.kind === "task_status" ? "check-square" : "users"} size={14} /></span><div><p><strong>{item.label}</strong></p><div className="campaign-activity-transition"><StatusPill status={item.fromStatus} /><Icon name="arrow-right" size={12} /><StatusPill status={item.toStatus} /></div><time dateTime={item.createdAt}>{formatDisplayDateTime(item.createdAt)}</time></div></article>)}</div> : !historyError && <EmptyCampaignState icon="clock" title="Belum ada perubahan status" description="Perubahan status tugas atau kerja sama influencer akan tercatat di sini." />}
      {(liveMode ? hasMore : localHistory.length > 5) && !showAllHistory && <button className="button button-soft button-sm campaign-activity-more" disabled={morePending} onClick={() => void loadMore()}>{morePending ? "Memuat aktivitas…" : "Lihat lainnya"}</button>}
    </section>
    {editingKpi !== undefined && canManage && <CampaignKpiDialog kpi={editingKpi} legacyName={!kpis.length ? campaign.kpi : ""} onClose={() => setEditingKpi(undefined)} onSave={async (input) => { await onSaveKpi(campaign.id, input, editingKpi?.id); setRevision((value) => value + 1); setEditingKpi(undefined); }} />}
  </div>;
}

function CampaignKpiDialog({ kpi, legacyName, onClose, onSave }: { kpi: CampaignKpi | null; legacyName?: string; onClose: () => void; onSave: (input: CampaignKpiInput) => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const pendingRef = useRef(pending);
  closeRef.current = onClose;
  pendingRef.current = pending;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (pending) return;
    const values = new FormData(event.currentTarget);
    const input = { name: String(values.get("name") || "").trim(), unit: String(values.get("unit") || "").trim(), baseline: Number(values.get("baseline")), targetIncrease: Number(values.get("targetIncrease")), current: Number(values.get("current")) };
    const validation = validateKpi(input); if (validation) return setError(validation);
    setPending(true); setError("");
    try { await onSave(input); } catch (error) { setError((error as Error).message); setPending(false); }
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingRef.current) closeRef.current();
      if (event.key !== "Tab") return;
      const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])") || []);
      if (!nodes.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus(); }
    };
    document.addEventListener("keydown", listener);
    return () => { document.removeEventListener("keydown", listener); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}><section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="campaign-kpi-title"><div className="modal-head"><div><h2 id="campaign-kpi-title">{kpi ? "Edit KPI" : "Tambah KPI"}</h2><p>Isi nilai awal, target kenaikan, dan nilai saat ini.</p></div><button className="icon-button" onClick={onClose} disabled={pending} aria-label="Tutup"><Icon name="close" /></button></div><form className="form-stack" onSubmit={submit}>
    <label className="form-field">Nama KPI<input className="modal-input" name="name" required maxLength={160} defaultValue={kpi?.name || legacyName || ""} autoFocus placeholder="Contoh: Pertumbuhan followers Instagram" /></label>
    <label className="form-field">Satuan<input className="modal-input" name="unit" required maxLength={40} defaultValue={kpi?.unit || ""} placeholder="followers, porsi, peserta, rupiah" /></label>
    <div className="two-fields"><label className="form-field">Nilai awal<input className="modal-input" name="baseline" type="number" min="0" step="any" required defaultValue={kpi?.baseline ?? 0} /></label><label className="form-field">Target kenaikan<input className="modal-input" name="targetIncrease" type="number" min="0.0001" step="any" required defaultValue={kpi?.targetIncrease} placeholder="Contoh: 200" /></label></div>
    <label className="form-field">Nilai sekarang<input className="modal-input" name="current" type="number" min="0" step="any" required defaultValue={kpi?.current ?? 0} /></label>
    <p className="campaign-form-hint">Contoh: awal 1.000, target kenaikan 200, sekarang 1.080 = capaian 40%.</p>
    {error && <div className="campaign-form-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose} disabled={pending}>Batal</button><button className="button button-primary" disabled={pending}>{pending ? "Menyimpan…" : "Simpan KPI"}</button></div>
    </form></section></div>;
}
