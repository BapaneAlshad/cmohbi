import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppData, TaskStatus } from "@/lib/types";

const taskStatusToDatabase: Record<TaskStatus, string> = {
  Backlog: "backlog",
  "To Do": "todo",
  "In Progress": "in_progress",
  Review: "review",
  Revisi: "revision",
  Done: "done",
};

const taskStatusFromDatabase: Record<string, TaskStatus> = Object.fromEntries(
  Object.entries(taskStatusToDatabase).map(([label, value]) => [value, label]),
) as Record<string, TaskStatus>;

function formatDate(value: string | null) {
  if (!value) return "Belum dijadwalkan";
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(`${value}T00:00:00`));
}

function formatPeriod(start: string | null, end: string | null) {
  if (!start && !end) return "Belum dijadwalkan";
  if (!start || !end) return formatDate(start || end);
  return `${formatDate(start)} — ${formatDate(end)}`;
}

export async function loadWorkspaceData(
  client: SupabaseClient,
  workspaceId: string,
  fallback: AppData,
  currentUserEmail: string,
): Promise<AppData> {
  const [campaignResult, taskResult, memberResult] = await Promise.all([
    client.from("campaigns").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
    client.from("tasks").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: true }),
    client.from("workspace_members").select("user_id, role").eq("workspace_id", workspaceId),
  ]);

  const firstError = campaignResult.error || taskResult.error || memberResult.error;
  if (firstError) throw firstError;

  const memberIds = (memberResult.data ?? []).map((member) => member.user_id);
  const profileResult = memberIds.length
    ? await client.from("profiles").select("id, full_name, job_title").in("id", memberIds)
    : { data: [], error: null };

  if (profileResult.error) throw profileResult.error;

  const profileById = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile]));
  const campaignRows = campaignResult.data ?? [];
  const taskRows = taskResult.data ?? [];
  const campaignById = new Map(campaignRows.map((campaign) => [campaign.id, campaign]));

  return {
    ...fallback,
    campaigns: campaignRows.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      brand: campaign.brand,
      pic: profileById.get(campaign.owner_id)?.full_name ?? "Belum ditentukan",
      period: formatPeriod(campaign.start_date, campaign.end_date),
      status: campaign.status,
      progress: Number(campaign.progress),
      budget: Number(campaign.budget),
      spent: Number(campaign.spent),
      kpi: campaign.kpi || campaign.objective || "Belum ditentukan",
      tasks: taskRows.filter((task) => task.campaign_id === campaign.id).length,
      content: 0,
    })),
    tasks: taskRows.map((task) => ({
      id: task.id,
      title: task.title,
      brand: campaignById.get(task.campaign_id)?.brand ?? "HBI",
      pic: profileById.get(task.assignee_id)?.full_name ?? "Belum ditentukan",
      due: formatDate(task.due_date),
      dueDate: task.due_date || undefined,
      priority: task.priority,
      status: taskStatusFromDatabase[task.status] ?? "Backlog",
      campaign: task.campaign_id,
    })),
    users: (memberResult.data ?? []).map((member, index) => {
      const profile = profileById.get(member.user_id);
      return {
        name: profile?.full_name ?? "Anggota tim",
        email: index === 0 ? currentUserEmail : "Email privat",
        role: profile?.job_title || member.role,
        status: "Aktif",
      };
    }),
  };
}

export async function saveWorkspaceData(
  client: SupabaseClient,
  workspaceId: string,
  userId: string,
  data: AppData,
) {
  const campaigns = data.campaigns
    .filter((campaign) => typeof campaign.id === "string")
    .map((campaign) => ({
      id: campaign.id,
      workspace_id: workspaceId,
      name: campaign.name,
      brand: campaign.brand,
      objective: campaign.kpi,
      kpi: campaign.kpi,
      budget: campaign.budget,
      spent: campaign.spent,
      status: campaign.status,
      progress: campaign.progress,
      owner_id: userId,
    }));

  const tasks = data.tasks
    .filter((task) => typeof task.id === "string")
    .map((task) => ({
      id: task.id,
      workspace_id: workspaceId,
      campaign_id: typeof task.campaign === "string" ? task.campaign : null,
      title: task.title,
      status: taskStatusToDatabase[task.status],
      priority: task.priority,
      due_date: task.dueDate || (/^\d{4}-\d{2}-\d{2}$/.test(task.due) ? task.due : null),
      assignee_id: userId,
      created_by: userId,
      updated_at: new Date().toISOString(),
    }));

  const results = await Promise.all([
    campaigns.length ? client.from("campaigns").upsert(campaigns, { onConflict: "id" }) : Promise.resolve({ error: null }),
    tasks.length ? client.from("tasks").upsert(tasks, { onConflict: "id" }) : Promise.resolve({ error: null }),
  ]);

  const error = results.find((result) => result.error)?.error;
  if (error) throw error;
}
