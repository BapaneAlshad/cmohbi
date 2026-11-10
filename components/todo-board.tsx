"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import type { CommonProps } from "./views";
import type { AppData, EntityId, Task, TaskStatus, UserIdentity } from "@/lib/types";
import { allowedTaskStatuses, boardTaskStatus, filteredBoardTasks, isTaskManager, taskIsPriority, taskStatuses } from "@/lib/task-workflow";
import { Icon, PageHeading, StatusPill, TaskPriorityStar } from "./ui";
import { TaskAssigneeAvatars } from "./task-assignees";
import { formatTaskDeadline } from "@/lib/date-format";

export function TodoView({ data, identity, mutateTask, deleteTask, openTaskEditor, decideTaskStatus, refreshTaskBoard, taskBoardError, notify }: CommonProps) {
  const manager = isTaskManager(identity);
  const [filters, setFilters] = useState<{ brand: string; pic: string; campaign: string }>({ brand: "all", pic: "all", campaign: "all" });
  const [activeId, setActiveId] = useState<EntityId | null>(null);
  const [mobile, setMobile] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor));
  useEffect(() => {
    const query = window.matchMedia("(max-width: 680px)"); const update = () => setMobile(query.matches); update();
    query.addEventListener("change", update); return () => query.removeEventListener("change", update);
  }, []);
  const statuses = taskStatuses.filter((status) => manager || status !== "Backlog");
  const tasks = filteredBoardTasks(data, identity, filters);
  const active = data.tasks.find((task) => String(task.id) === String(activeId));
  const targets = active ? allowedTaskStatuses(active, data.users, identity) : [];
  const brands = Array.from(new Set([...data.brands.map((brand) => brand.name), ...data.tasks.map((task) => task.brand)])).filter(Boolean);
  const campaigns = data.campaigns.filter((campaign) => campaign.lifecycleStatus === "active" && (filters.brand === "all" || campaign.brand === filters.brand));
  const changeStatus = (id: EntityId, status: TaskStatus) => {
    const task = data.tasks.find((item) => String(item.id) === String(id));
    if (!task || status === task.status) return;
    if (!allowedTaskStatuses(task, data.users, identity).includes(status)) return notify("Perpindahan status ini tidak tersedia untuk Anda.");
    void mutateTask(id, { status }).then(() => notify(manager ? `Status tugas dipindahkan ke ${status}.` : "Pengajuan status dikirim. Menunggu persetujuan Super Admin.")).catch((error) => notify(error.message));
  };
  const dragEnd = ({ active: dragged, over }: DragEndEvent) => {
    setActiveId(null); const status = over?.data.current?.status as TaskStatus | undefined, id = dragged.data.current?.taskId as EntityId | undefined;
    if (status && id !== undefined) changeStatus(id, status);
  };
  return <>
    <PageHeading kicker="Workspace / To-Do" title="Papan kerja tim" description="" action={manager ? <button className="button button-primary" onClick={() => openTaskEditor()}><Icon name="plus" size={15} />Tambah tugas</button> : undefined} />
    {taskBoardError && <div className="task-board-error" role="alert"><span>{taskBoardError}</span><button className="button button-soft button-sm" onClick={() => void refreshTaskBoard()}>Coba lagi</button></div>}
    <div className="toolbar todo-filters"><div className="toolbar-left">
      <label className="filter-chip"><span>Brand</span><select className="select-clean" aria-label="Filter berdasarkan brand" value={filters.brand} onChange={(event) => setFilters({ ...filters, brand: event.target.value, campaign: "all" })}><option value="all">Semua brand</option>{brands.map((brand) => <option key={brand}>{brand}</option>)}</select></label>
      <label className="filter-chip"><span>PIC</span><select className="select-clean" aria-label="Filter berdasarkan PIC" value={filters.pic} onChange={(event) => setFilters({ ...filters, pic: event.target.value })}><option value="all">Semua</option><option value="mine">Hanya saya</option>{manager && data.users.map((user) => <option key={String(user.id ?? user.username)} value={String(user.id ?? user.username)}>{user.name}</option>)}</select></label>
      <label className="filter-chip"><span>Campaign</span><select className="select-clean" aria-label="Filter berdasarkan campaign" value={filters.campaign} onChange={(event) => setFilters({ ...filters, campaign: event.target.value })}><option value="all">Semua campaign</option><option value="none">Tanpa campaign</option>{campaigns.map((campaign) => <option value={String(campaign.id)} key={String(campaign.id)}>{campaign.name}</option>)}</select></label>
    </div><button className="button button-soft button-sm" onClick={() => setFilters({ brand: "all", pic: "all", campaign: "all" })}>Reset filter</button></div>
    <DndContext sensors={mobile || identity?.accessRole === "viewer" ? [] : sensors} collisionDetection={closestCenter} onDragStart={({ active }) => setActiveId(active.data.current?.taskId as EntityId)} onDragCancel={() => setActiveId(null)} onDragEnd={dragEnd}>
      <div className="todo-board-scroll"><div className="todo-board" style={{ gridTemplateColumns: `repeat(${statuses.length}, minmax(205px, 1fr))` }}>{statuses.map((status) => <TodoColumn key={status} status={status} disabled={activeId != null && status !== active?.status && !targets.includes(status)}>
        {tasks.filter((task) => boardTaskStatus(task) === status).map((task) => <TodoCard key={String(task.id)} task={task} data={data} identity={identity} mobile={mobile} activeId={activeId} onStatus={changeStatus} onEdit={() => openTaskEditor(task.id)} onDelete={async () => { try { await deleteTask(task.id); notify("Tugas berhasil dihapus."); } catch (error) { notify((error as Error).message); } }} onDecide={async (approve) => { try { await decideTaskStatus(task.id, approve); } catch (error) { notify((error as Error).message); throw error; } }} />)}
      </TodoColumn>)}</div></div>
    </DndContext>
  </>;
}

function TodoColumn({ status, children, disabled }: { status: TaskStatus; children: React.ReactNode[]; disabled: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id: `status:${status}`, data: { status }, disabled });
  return <section ref={setNodeRef} className={`todo-column todo-status-${status.toLowerCase().replace(/\s+/g, "-")} ${isOver ? "is-over" : ""}`}><div className="todo-column-head"><div className="todo-column-title"><StatusPill status={status} /></div><span className="todo-column-count">{children.length}</span></div><div className="todo-stack">{children.length ? children : <div className="empty-column">Belum ada tugas</div>}</div></section>;
}

function TodoCard({ task, data, identity, mobile, activeId, onStatus, onEdit, onDelete, onDecide }: { task: Task; data: AppData; identity?: UserIdentity; mobile: boolean; activeId: EntityId | null; onStatus: (id: EntityId, status: TaskStatus) => void; onEdit: () => void; onDelete: () => Promise<void>; onDecide: (approve: boolean) => Promise<void> }) {
  const [menu, setMenu] = useState(false), [pendingDecision, setPendingDecision] = useState(false), [pendingDelete, setPendingDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const manager = isTaskManager(identity), request = task.pendingStatusRequest;
  const allowed = allowedTaskStatuses(task, data.users, identity);
  const draggable = !mobile && allowed.length > 0;
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: `task:${task.id}`, data: { taskId: task.id, status: task.status }, disabled: !draggable });
  const style: CSSProperties | undefined = transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : undefined;
  const campaign = data.campaigns.find((item) => String(item.id) === String(task.campaign));
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(false); };
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(false); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", keydown); };
  }, [menu]);
  const decide = async (approve: boolean) => { if (pendingDecision) return; setPendingDecision(true); try { await onDecide(approve); } catch { /* The caller displays the error; keep the request available. */ } finally { setPendingDecision(false); } };
  const removeTask = async () => {
    if (pendingDelete || !window.confirm(`Hapus tugas “${task.title}” secara permanen? Permintaan status terkait akan ikut dihapus, sedangkan riwayat audit tetap tersimpan.`)) return;
    setMenu(false); setPendingDelete(true);
    try { await onDelete(); } finally { setPendingDelete(false); }
  };
  const statusOptions = request ? [request.toStatus] : Array.from(new Set([task.status, ...allowed]));
  return <article ref={setNodeRef} style={style} className={`task-card ${String(activeId) === String(task.id) ? "is-dragging" : ""} ${request ? "task-card-awaiting" : ""}`} aria-label={request ? `${task.title}, menunggu persetujuan ${request.toStatus}` : task.title}>
    <div className="task-card-top"><div className={draggable ? "task-drag-handle task-title-handle" : "task-title-handle"} {...(draggable ? listeners : {})} {...(draggable ? attributes : {})} title={draggable ? "Tarik untuk memindahkan tugas" : undefined}><h4>{task.title}</h4></div>{manager && <div ref={menuRef} className="task-card-menu"><button className="icon-button" onClick={() => setMenu(!menu)} aria-label={`Aksi tugas ${task.title}`} aria-haspopup="menu" aria-expanded={menu}><Icon name="more-horizontal" size={14} /></button>{menu && <div role="menu" className="task-card-menu-options"><button role="menuitem" onClick={() => { setMenu(false); onEdit(); }}><Icon name="edit" size={13} />Edit tugas</button><button role="menuitem" className="danger" disabled={pendingDelete} onClick={() => void removeTask()}><Icon name="trash" size={13} />Hapus tugas</button></div>}</div>}</div>
    <div className="task-brand-row"><span>{task.brand}</span><TaskPriorityStar active={taskIsPriority(task)} /></div>
    {campaign && <div className="task-campaign-name">{campaign.name}</div>}
    <div className="task-meta"><span className="task-due">{formatTaskDeadline(task, campaign)}</span><TaskAssigneeAvatars task={task} users={data.users} /></div>
    {request && <div className="task-pending-summary"><strong>Menunggu persetujuan</strong><span>{request.fromStatus} → {request.toStatus}</span><small>Diajukan {request.requestedByName}</small>{manager && <div className="task-approval-actions"><button className="button button-primary button-sm" disabled={pendingDecision} onClick={() => void decide(true)}>Setujui</button><button className="button button-soft button-sm" disabled={pendingDecision} onClick={() => void decide(false)}>Tolak</button></div>}</div>}
    {mobile && <select className="task-status-select" aria-label={`Status ${task.title}`} value={boardTaskStatus(task)} disabled={!allowed.length || Boolean(request)} onChange={(event) => onStatus(task.id, event.target.value as TaskStatus)}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select>}
  </article>;
}
