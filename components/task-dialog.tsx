"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AppData, EntityId, Task, TaskDraft, TaskStatus } from "@/lib/types";
import { taskDate, validateTaskPatch } from "@/lib/campaign-overview";
import { taskIsPriority, taskStatuses } from "@/lib/task-workflow";
import { TaskAssigneePicker } from "./task-assignees";
import { Icon } from "./ui";

export function TaskDialog({ data, task, initialCampaignId, onClose, onSave }: { data: AppData; task?: Task | null; initialCampaignId?: EntityId | null; onClose: () => void; onSave: (draft: TaskDraft, id?: EntityId) => Promise<void> }) {
  const initialCampaign = data.campaigns.find((item) => String(item.id) === String(task?.campaign ?? initialCampaignId));
  const initialPhases = initialCampaign?.timelineConfig?.phaseMode ? initialCampaign.timelineConfig.phases : [];
  const savedPhaseId = task ? initialCampaign?.timelineConfig?.taskPhase[String(task.id)] || "" : "";
  const initialPhaseId = initialPhases.find((phase) => phase.id === savedPhaseId)?.id || initialPhases[0]?.id || "";
  const [brand, setBrand] = useState(initialCampaign?.brand || task?.brand || data.brands[0]?.name || "");
  const [campaignId, setCampaignId] = useState(String(initialCampaign?.id ?? ""));
  const [phaseId, setPhaseId] = useState(initialPhaseId);
  const initialDueDate = task ? (taskDate(task) !== "9999-12-31" ? taskDate(task) : "") : initialPhases.find((phase) => phase.id === initialPhaseId)?.endDate || "";
  const [dueDate, setDueDate] = useState(initialDueDate);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const pendingRef = useRef(false);
  const campaigns = data.campaigns.filter((item) => item.lifecycleStatus === "active" && item.brand === brand);
  const campaign = campaigns.find((item) => String(item.id) === campaignId);
  const phases = campaign?.timelineConfig?.phaseMode ? campaign.timelineConfig.phases : [];

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    formRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingRef.current) closeRef.current();
      if (event.key !== "Tab") return;
      const nodes = Array.from(formRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([disabled]),select:not([disabled]),summary") || []).filter((item) => item.getClientRects().length > 0);
      if (!nodes.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (pendingRef.current) return;
    const values = new FormData(event.currentTarget);
    const content = String(values.get("contentType"));
    const draft: TaskDraft = { title: String(values.get("title") || "").trim(), brand, campaign: campaign?.id ?? null, dueDate: String(values.get("dueDate") || ""), assigneeIds: values.getAll("assigneeIds").map(String), isPriority: values.get("isPriority") === "yes", status: String(values.get("status")) as TaskStatus, contentCalendarType: content === "reels" || content === "feed_carousel" ? content : null, ...(phases.length ? { phaseId } : {}) };
    const validation = validateTaskPatch(draft);
    if (validation || !brand) return setError(validation || "Pilih brand terlebih dahulu.");
    pendingRef.current = true; setPending(true); setError("");
    try { await onSave(draft, task?.id); onClose(); }
    catch (error) { setError((error as Error).message); }
    finally { pendingRef.current = false; setPending(false); }
  };

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pendingRef.current) onClose(); }}><section ref={formRef} className="modal task-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title"><div className="modal-head"><div><h2 id="task-dialog-title">{task ? "Edit pekerjaan" : "Tambah tugas baru"}</h2><p>Atur brand, campaign, PIC, dan deadline pekerjaan.</p></div><button className="icon-button" onClick={onClose} disabled={pending} aria-label="Tutup"><Icon name="close" /></button></div>
    <form className="form-stack" onSubmit={submit} aria-busy={pending}>
      <fieldset className="task-form-fields" disabled={pending}>
        <label className="form-field">Judul tugas *<input className="modal-input" name="title" required defaultValue={task?.title || ""} placeholder="Contoh: Finalisasi key visual" /></label>
        <div className="two-fields"><label className="form-field">Brand *<select className="modal-input" aria-label="Brand" required value={brand} onChange={(event) => { setBrand(event.target.value); setCampaignId(""); setPhaseId(""); }}><option value="" disabled>Pilih brand</option>{data.brands.map((item) => <option key={String(item.id)} value={item.name}>{item.name}</option>)}</select></label><label className="form-field">Campaign<select className="modal-input" aria-label="Campaign" value={campaignId} onChange={(event) => {
          const nextCampaignId = event.target.value;
          const nextCampaign = data.campaigns.find((item) => String(item.id) === nextCampaignId && item.lifecycleStatus === "active" && item.brand === brand);
          const nextPhases = nextCampaign?.timelineConfig?.phaseMode ? nextCampaign.timelineConfig.phases : [];
          const firstPhase = nextPhases[0];
          setCampaignId(nextCampaignId);
          setPhaseId(firstPhase?.id || "");
          if (!task && firstPhase?.endDate) setDueDate(firstPhase.endDate);
        }}><option value="">Tanpa campaign</option>{campaigns.map((item) => <option value={String(item.id)} key={String(item.id)}>{item.name}</option>)}</select></label></div>
        <div className="form-field"><label>PIC</label><TaskAssigneePicker users={data.users} selectedIds={task?.assigneeIds} legacyPic={task?.pic} /></div>
        <div className="two-fields"><label className="form-field">Deadline *<input className="modal-input" name="dueDate" type="date" required value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label><label className="form-field">Prioritas<select className="modal-input" aria-label="Prioritas" name="isPriority" defaultValue={task && taskIsPriority(task) ? "yes" : "no"}><option value="no">Tidak</option><option value="yes">Ya</option></select></label></div>
        <div className="two-fields"><label className="form-field">Status<select className="modal-input" aria-label="Status" name="status" defaultValue={task?.status || (initialCampaignId != null ? "To Do" : "Backlog")}>{taskStatuses.map((status) => <option key={status}>{status}</option>)}</select></label><label className="form-field">Jenis konten<select className="modal-input" aria-label="Jenis konten" name="contentType" defaultValue={task?.contentCalendarType || "none"}><option value="none">Non-konten</option><option value="feed_carousel">Feed / Carousel</option><option value="reels">Reels</option></select></label></div>
        {phases.length > 0 && <label className="form-field">Fase<select className="modal-input" aria-label="Fase" required value={phaseId} onChange={(event) => {
          const nextPhaseId = event.target.value;
          setPhaseId(nextPhaseId);
          if (!task && nextPhaseId) {
            const selectedPhase = phases.find((phase) => String(phase.id) === nextPhaseId);
            if (selectedPhase?.endDate) setDueDate(selectedPhase.endDate);
          }
        }}>{phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}</select></label>}
        <p className="campaign-form-hint">Backlog hanya terlihat oleh Super Admin.</p>
      </fieldset>
      {error && <div className="campaign-form-error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose} disabled={pending}>Batal</button><button className="button button-primary" disabled={pending || !data.brands.length}>{pending ? "Menyimpan…" : task ? "Simpan perubahan" : "Tambah tugas"}</button></div>
    </form></section></div>;
}
