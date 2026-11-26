import type { AppData, EntityId, Task } from "./types";

const clean = (value: unknown, max = 120) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function taskAssigneeIds(task: Task) {
  return Array.isArray(task.assigneeIds) ? task.assigneeIds.map(String) : [];
}

export function buildHermesTaskContext(data: Pick<AppData, "users" | "tasks">, currentUserId: EntityId) {
  const usersById = new Map(data.users.flatMap((user) => user.id === undefined ? [] : [[String(user.id), user] as const]));
  const currentUser = usersById.get(String(currentUserId));
  const currentUserName = clean(currentUser?.name);

  const tasks = data.tasks.map((task) => {
    const assigneeIds = taskAssigneeIds(task);
    const pic = clean(task.pic) || "Belum ditentukan";
    const assignees = [...new Set(assigneeIds.map((id) => clean(usersById.get(id)?.name)).filter(Boolean))];
    if (pic !== "Belum ditentukan" && !assignees.includes(pic)) assignees.unshift(pic);
    const assignedToCurrentUser = assigneeIds.includes(String(currentUserId));

    return {
      id: task.id,
      title: clean(task.title, 180),
      brand: clean(task.brand, 100),
      campaignId: task.campaign,
      dueDate: clean(task.dueDate || task.due, 40),
      status: task.status,
      priority: clean(task.priority, 40),
      contentType: task.contentCalendarType || null,
      pic,
      assignees,
      assignedToCurrentUser,
    };
  });

  return {
    currentUser: currentUserName ? { name: currentUserName } : null,
    tasks,
  };
}
