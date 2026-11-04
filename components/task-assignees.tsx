"use client";

import type { EntityId, Task, User } from "@/lib/types";
import { Avatar } from "@/components/ui";
import { useEffect, useRef, useState } from "react";

export function taskAssigneeIds(task: Pick<Task, "assigneeIds" | "pic">, users: User[]) {
  if (task.assigneeIds !== undefined) return task.assigneeIds;
  const legacy = users.find((user) => user.name === task.pic || user.username === task.pic);
  return legacy ? [legacy.id ?? legacy.username] : [];
}

export function taskAssigneeNames(task: Pick<Task, "assigneeIds" | "pic">, users: User[]) {
  const names = taskAssigneeIds(task, users)
    .map((id) => users.find((user) => String(user.id ?? user.username) === String(id))?.name)
    .filter((name): name is string => Boolean(name));
  if (names.length || task.assigneeIds !== undefined) return Array.from(new Set(names));
  return task.pic && task.pic !== "Belum ditentukan" ? Array.from(new Set(task.pic.split(",").map((name) => name.trim()).filter(Boolean))) : [];
}

export function TaskAssigneeAvatars({ task, users, limit = 4 }: { task: Pick<Task, "assigneeIds" | "pic">; users: User[]; limit?: number }) {
  const ids = taskAssigneeIds(task, users);
  const assigned = ids.map((id) => users.find((user) => String(user.id ?? user.username) === String(id))).filter((user): user is User => Boolean(user));
  const names = assigned.length ? assigned.map((user) => user.name) : task.assigneeIds === undefined && task.pic && task.pic !== "Belum ditentukan" ? [task.pic] : [];
  if (!names.length) return <span className="task-assignee-empty" aria-label="Belum ada PIC">—</span>;
  return <span className="task-assignee-stack" role="group" aria-label={`PIC: ${names.join(", ")}`}>
    {assigned.slice(0, limit).map((user) => <span className="task-assignee-avatar" key={String(user.id ?? user.username)} title={user.name} aria-label={user.name}>
      <Avatar name={user.name} src={user.avatarUrl} />
    </span>)}
    {!assigned.length && names.slice(0, limit).map((name) => <span className="task-assignee-avatar" key={name} title={name} aria-label={name}><Avatar name={name} /></span>)}
    {names.length > limit && <span className="task-assignee-overflow" title={names.slice(limit).join(", ")}>+{names.length - limit}</span>}
  </span>;
}

export function TaskAssigneePicker({ users, selectedIds, legacyPic, disabled = false, name = "assigneeIds", onSelectionChange }: { users: User[]; selectedIds?: EntityId[]; legacyPic?: string; disabled?: boolean; name?: string; onSelectionChange?: (ids: string[]) => void | Promise<void> }) {
  const initial = new Set((selectedIds || []).map(String));
  if (selectedIds === undefined && legacyPic) {
    const legacy = users.find((user) => user.name === legacyPic || user.username === legacyPic);
    if (legacy) initial.add(String(legacy.id ?? legacy.username));
  }
  const [selected, setSelected] = useState(initial);
  const pickerRef = useRef<HTMLDetailsElement>(null);
  const selectionKey = Array.from(initial).sort().join("|");
  useEffect(() => { setSelected(new Set(selectionKey ? selectionKey.split("|") : [])); }, [selectionKey]);
  const selectedUsers = users.filter((user) => selected.has(String(user.id ?? user.username)));
  const summary = selectedUsers.length ? selectedUsers.map((user) => user.name).join(", ") : "Pilih anggota";
  return <details ref={pickerRef} className={`task-assignee-picker ${disabled ? "disabled" : ""}`}>
    <summary aria-label="Pilih beberapa PIC" aria-disabled={disabled} onClick={(event) => { if (disabled) event.preventDefault(); }}>
      <span className="task-assignee-picker-label">{summary}</span><span aria-hidden="true">⌄</span>
    </summary>
    {!disabled && <div className="task-assignee-options" role="group" aria-label="Anggota yang ditugaskan">
      <div className="task-assignee-options-list">
        {users.length ? users.map((user) => {
          const id = String(user.id ?? user.username);
          return <label key={id}><input type="checkbox" name={name} value={id} aria-label={`Tugaskan ${user.name}`} checked={selected.has(id)} onChange={(event) => { const next = new Set(selected); if (event.currentTarget.checked) next.add(id); else next.delete(id); const previous = selected; setSelected(next); Promise.resolve(onSelectionChange?.([...next])).catch(() => setSelected(previous)); }} /><span className="task-assignee-option-avatar"><Avatar name={user.name} src={user.avatarUrl} /></span><span>{user.name}</span></label>;
        }) : <span className="task-assignee-no-options">Belum ada anggota workspace.</span>}
      </div>
      <div className="task-assignee-picker-actions"><button type="button" className="button button-primary button-sm" onClick={() => { if (pickerRef.current) pickerRef.current.open = false; }}>OK</button></div>
    </div>}
  </details>;
}
