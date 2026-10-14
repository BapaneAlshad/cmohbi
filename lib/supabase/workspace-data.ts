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

function isMissingBookingsTable(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.message?.includes("influencer_bookings");
}

export async function loadWorkspaceData(
  client: SupabaseClient,
  workspaceId: string,
  fallback: AppData,
  currentUserEmail: string,
): Promise<AppData> {
  const [campaignResult, taskResult, memberResult, bookingResult] = await Promise.all([
    client.from("campaigns").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
    client.from("tasks").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: true }),
    client.from("workspace_members").select("user_id, role").eq("workspace_id", workspaceId),
    client.from("influencer_bookings").select("*").eq("workspace_id", workspaceId).order("scheduled_at", { ascending: true }),
  ]);

  const firstError = campaignResult.error || taskResult.error || memberResult.error;
  if (firstError) throw firstError;

  const memberIds = (memberResult.data ?? []).map((member) => member.user_id);
  const profileResult = memberIds.length
    ? await client.from("profiles").select("id, full_name, username, email, whatsapp, job_title").in("id", memberIds)
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
    influencerSchedules: bookingResult.error && isMissingBookingsTable(bookingResult.error)
      ? fallback.influencerSchedules
      : (bookingResult.data ?? []).map((booking) => ({
        id: booking.id,
        influencer: booking.influencer_name,
        platform: booking.platform === "instagram" ? "Instagram" : booking.platform === "facebook" ? "Facebook" : "TikTok",
        campaign: campaignById.get(booking.campaign_id)?.name ?? "Tanpa campaign",
        content: booking.content_title,
        date: String(booking.scheduled_at).slice(0, 10),
        time: String(booking.scheduled_at).slice(11, 16),
        status: booking.status,
        rate: Number(booking.rate),
        spent: Number(booking.spent),
        paymentStatus: booking.payment_status,
        notes: booking.notes || undefined,
      })),
    users: (memberResult.data ?? []).map((member, index) => {
      const profile = profileById.get(member.user_id);
      return {
        name: profile?.full_name ?? "Anggota tim",
        username: profile?.username ?? "",
        email: profile?.email || (index === 0 ? currentUserEmail : "Email privat"),
        whatsapp: profile?.whatsapp ?? "",
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

  const campaignIdByName = new Map(data.campaigns.map((campaign) => [campaign.name, campaign.id]));
  const influencerSchedules = data.influencerSchedules
    .filter((schedule) => typeof schedule.id === "string")
    .map((schedule) => ({
      id: schedule.id,
      workspace_id: workspaceId,
      influencer_name: schedule.influencer,
      platform: schedule.platform.toLowerCase(),
      campaign_id: typeof campaignIdByName.get(schedule.campaign) === "string" ? campaignIdByName.get(schedule.campaign) : null,
      content_title: schedule.content,
      scheduled_at: `${schedule.date}T${schedule.time || "00:00"}:00+07:00`,
      status: schedule.status,
      rate: schedule.rate,
      spent: schedule.spent,
      payment_status: schedule.paymentStatus,
      notes: schedule.notes || null,
      created_by: userId,
      updated_at: new Date().toISOString(),
    }));

  const results = await Promise.all([
    campaigns.length ? client.from("campaigns").upsert(campaigns, { onConflict: "id" }) : Promise.resolve({ error: null }),
    tasks.length ? client.from("tasks").upsert(tasks, { onConflict: "id" }) : Promise.resolve({ error: null }),
    influencerSchedules.length ? client.from("influencer_bookings").upsert(influencerSchedules, { onConflict: "id" }) : Promise.resolve({ error: null }),
  ]);

  const error = results.map((result) => result.error).find((result) => result && !isMissingBookingsTable(result)) ?? null;
  if (error) throw error;
}
