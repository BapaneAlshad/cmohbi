import type { AppData, EntityId, Task } from "./types";

const clean = (value: unknown, max = 120) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function taskAssigneeIds(task: Task) {
  return Array.isArray(task.assigneeIds) ? task.assigneeIds.map(String) : [];
}

function getJakartaDateContext(now = new Date()) {
  const parts = new Map(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const year = Number(parts.get("year"));
  const month = Number(parts.get("month"));
  const today = `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
  const monthStart = `${parts.get("year")}-${parts.get("month")}-01`;
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const label = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    month: "long",
    year: "numeric",
  }).format(now);
  return { today, monthStart, monthEnd, label };
}

export function buildHermesTaskContext(
  data: Pick<AppData, "users" | "tasks">,
  currentUserId: EntityId,
  now = new Date(),
) {
  const dateContext = getJakartaDateContext(now);
  const usersById = new Map(data.users.flatMap((user) => user.id === undefined ? [] : [[String(user.id), user] as const]));
  const currentUser = usersById.get(String(currentUserId));
  const currentUserName = clean(currentUser?.name);

  const tasksWithFilterDate = data.tasks.map((task) => {
    const assigneeIds = taskAssigneeIds(task);
    const pic = clean(task.pic) || "Belum ditentukan";
    const assignees = [...new Set(assigneeIds.map((id) => clean(usersById.get(id)?.name)).filter(Boolean))];
    if (pic !== "Belum ditentukan" && !assignees.includes(pic)) assignees.unshift(pic);
    const assignedToCurrentUser = assigneeIds.includes(String(currentUserId));
    const monthFilterDate = typeof task.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)
      ? task.dueDate
      : null;

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
      isComplete: task.status === "Done",
      _monthFilterDate: monthFilterDate,
    };
  });

  const withoutFilterDate = (task: typeof tasksWithFilterDate[number]) => {
    const { _monthFilterDate: _date, ...safeTask } = task;
    return safeTask;
  };
  const myTasks = tasksWithFilterDate.filter((task) => task.assignedToCurrentUser);
  const myTasksThisMonth = myTasks
    .filter((task) => task._monthFilterDate && task._monthFilterDate >= dateContext.monthStart && task._monthFilterDate <= dateContext.monthEnd)
    .sort((left, right) => left._monthFilterDate!.localeCompare(right._monthFilterDate!));
  const myUndatedTasks = myTasks.filter((task) => !task._monthFilterDate);

  return {
    timezone: "Asia/Jakarta",
    today: dateContext.today,
    currentMonth: {
      label: dateContext.label,
      startsOn: dateContext.monthStart,
      endsOn: dateContext.monthEnd,
      taskDateField: "dueDate",
    },
    currentUser: currentUserName ? { name: currentUserName } : null,
    myTasksThisMonth: {
      total: myTasksThisMonth.length,
      openCount: myTasksThisMonth.filter((task) => !task.isComplete).length,
      completedCount: myTasksThisMonth.filter((task) => task.isComplete).length,
      tasks: myTasksThisMonth.slice(0, 100).map(withoutFilterDate),
      omittedCount: Math.max(0, myTasksThisMonth.length - 100),
    },
    myUndatedTasks: {
      total: myUndatedTasks.length,
      tasks: myUndatedTasks.slice(0, 40).map(withoutFilterDate),
      omittedCount: Math.max(0, myUndatedTasks.length - 40),
    },
    tasks: tasksWithFilterDate.map(withoutFilterDate),
  };
}
