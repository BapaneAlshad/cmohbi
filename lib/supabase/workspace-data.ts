import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppData, ContentItem, EntityId, TaskStatus } from "@/lib/types";
import { formatCampaignPeriod } from "@/lib/campaign-form";

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

function isMissingBookingsTable(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.message?.includes("influencer_bookings");
}

function isMissingSocialHubTable(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.message?.includes("social_inbox");
}

function isMissingOperationalTable(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || ["marketing_requests", "marketing_influencers", "marketing_transactions"].some((table) => message.includes(table));
}

function isMissingCampaignAuditColumn(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42703"
    || error?.code === "PGRST204"
    || ["created_by", "updated_by", "updated_at"].some((column) => message.includes(column));
}

function isUuid(value: EntityId | null | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
}

export async function loadWorkspaceData(
  client: SupabaseClient,
  workspaceId: string,
  fallback: AppData,
  currentUserEmail: string,
): Promise<AppData> {
  const [campaignResult, taskResult, memberResult, bookingResult, accountResult, metricResult, postResult, inboxResult, requestResult, influencerResult, transactionResult] = await Promise.all([
    client.from("campaigns").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
    client.from("tasks").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: true }),
    client.from("workspace_members").select("user_id, role").eq("workspace_id", workspaceId),
    client.from("influencer_bookings").select("*").eq("workspace_id", workspaceId).order("scheduled_at", { ascending: true }),
    client.from("social_accounts").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: true }),
    client.from("social_metric_snapshots").select("*").eq("workspace_id", workspaceId).order("captured_at", { ascending: true }),
    client.from("social_posts").select("*").eq("workspace_id", workspaceId).order("scheduled_at", { ascending: true }),
    client.from("social_inbox").select("*").eq("workspace_id", workspaceId).order("occurred_at", { ascending: false }),
    client.from("marketing_requests").select("*").eq("workspace_id", workspaceId).order("request_date", { ascending: false }),
    client.from("marketing_influencers").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
    client.from("marketing_transactions").select("*").eq("workspace_id", workspaceId).order("transaction_date", { ascending: false }),
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
  const fallbackAccounts = fallback.socialAccounts;
  const socialHubTablesMissing = Boolean(accountResult.error && isMissingSocialHubTable(accountResult.error));
  const connectionRows = accountResult.error ? [] : (accountResult.data ?? []);
  const liveMetricRows = metricResult.error ? [] : (metricResult.data ?? []);
  const latestMetricByAccount = new Map<string, (typeof liveMetricRows)[number]>();
  for (const metric of liveMetricRows) {
    const previous = latestMetricByAccount.get(metric.social_account_id);
    if (!previous || new Date(metric.captured_at).getTime() > new Date(previous.captured_at).getTime()) latestMetricByAccount.set(metric.social_account_id, metric);
  }
  const accountRows = socialHubTablesMissing ? fallbackAccounts : connectionRows.map((account) => ({
    id: account.id,
    platform: account.platform,
    name: account.display_name,
    handle: account.handle || "",
    status: account.status,
    lastSync: account.last_sync_at ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(account.last_sync_at)) : null,
    followers: Number(latestMetricByAccount.get(account.id)?.followers ?? 0),
  }));
  const accountById = new Map(accountRows.map((account) => [account.id, account]));
  const metrics = metricResult.error ? fallback.socialSnapshots : liveMetricRows.map((metric) => ({
    platform: accountById.get(metric.social_account_id)?.platform ?? "instagram",
    date: new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(new Date(metric.captured_at)),
    followers: Number(metric.followers),
    reach: Number(metric.reach),
    impressions: Number(metric.impressions),
    engagementRate: Number(metric.engagement_rate),
    views: Number(metric.views),
  }));
  const posts = postResult.error ? fallback.socialPosts : (postResult.data ?? []).map((post) => ({
    id: post.id,
    platform: accountById.get(post.social_account_id)?.platform ?? "instagram",
    title: post.title,
    publishedAt: post.published_at ? formatDate(String(post.published_at).slice(0, 10)) : post.scheduled_at ? formatDate(String(post.scheduled_at).slice(0, 10)) : "Belum tayang",
    reach: Number(post.metrics?.reach ?? 0),
    engagementRate: Number(post.metrics?.engagementRate ?? 0),
    status: (post.status === "published" ? "published" : post.status === "scheduled" ? "scheduled" : "draft") as "published" | "scheduled" | "draft",
  }));
  const content = postResult.error ? fallback.content : (postResult.data ?? []).map((post) => {
    const platform = accountById.get(post.social_account_id)?.platform ?? "instagram";
    const dateSource = String(post.scheduled_at || post.published_at || post.created_at || "");
    const date = Number(dateSource.slice(8, 10)) || 1;
    const status = post.status === "published" ? "Tayang" : post.status === "scheduled" ? "Terjadwal" : post.status === "failed" ? "Gagal" : "Draf";
    const contentPlatform = (platform === "instagram" ? "Instagram" : platform === "facebook" ? "Facebook" : platform === "threads" ? "Threads" : "TikTok") as ContentItem["platform"];
    return {
      id: post.id,
      title: post.title,
      date,
      status,
      brand: "HBI",
      platform: contentPlatform,
      caption: post.caption || undefined,
      mediaUrl: post.media_url || undefined,
      mediaType: post.media_type || undefined,
      scheduledAt: post.scheduled_at || undefined,
    };
  });
  const inbox = inboxResult.error ? fallback.socialInbox : (inboxResult.data ?? []).map((item) => ({
    id: item.id,
    platform: item.platform,
    kind: item.kind,
    author: item.author,
    body: item.body,
    postTitle: item.post_title || undefined,
    occurredAt: new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.occurred_at)),
    status: item.status,
    canReply: item.can_reply,
  }));
  const requests = requestResult.error ? fallback.requests : (requestResult.data ?? []).map((request) => ({
    id: request.id,
    title: request.title,
    sender: request.sender,
    date: String(request.request_date),
    brand: request.brand,
    priority: request.priority,
    status: request.status,
    pic: profileById.get(request.pic_id)?.full_name,
    icon: request.icon || "✦",
  }));
  const influencers = influencerResult.error ? fallback.influencers : (influencerResult.data ?? []).map((influencer) => ({
    id: influencer.id,
    name: influencer.name,
    platform: (influencer.platform === "facebook" ? "Facebook" : influencer.platform === "tiktok" ? "TikTok" : "Instagram") as AppData["influencers"][number]["platform"],
    niche: influencer.niche || "Belum diisi",
    rate: Number(influencer.rate),
    followers: influencer.followers || "—",
    engagement: influencer.engagement || "—",
    status: influencer.status || "Review",
  }));
  const transactions = transactionResult.error ? fallback.transactions : (transactionResult.data ?? []).map((transaction) => ({
    id: transaction.id,
    category: transaction.category,
    vendor: transaction.vendor,
    date: String(transaction.transaction_date),
    amount: Number(transaction.amount),
    type: transaction.transaction_type,
    status: transaction.status,
    brand: transaction.brand,
  }));

  return {
    ...fallback,
    content,
    socialAccounts: accountRows,
    socialSnapshots: metrics,
    socialPosts: posts,
    socialInbox: inbox,
    requests,
    influencers,
    transactions,
    campaigns: campaignRows.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      brand: campaign.brand,
      objective: campaign.objective || "",
      startDate: campaign.start_date,
      endDate: campaign.end_date,
      period: formatCampaignPeriod(campaign.start_date, campaign.end_date),
      status: campaign.status,
      progress: Number(campaign.progress),
      budget: Number(campaign.budget),
      spent: Number(campaign.spent),
      kpi: campaign.kpi || "",
      tasks: taskRows.filter((task) => task.campaign_id === campaign.id).length,
      content: 0,
      lifecycleStatus: campaign.lifecycle_status || "active",
      archivedAt: campaign.archived_at,
      archivedBy: campaign.archived_by,
      deletedAt: campaign.deleted_at,
      deletedBy: campaign.deleted_by,
      previousLifecycleStatus: campaign.previous_lifecycle_status,
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
        campaignId: booking.campaign_id || null,
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
  const [existingCampaignAuditResult, existingTaskResult, existingRequestResult] = await Promise.all([
    client.from("campaigns").select("id, owner_id, created_by").eq("workspace_id", workspaceId),
    client.from("tasks").select("id, assignee_id, created_by").eq("workspace_id", workspaceId),
    client.from("marketing_requests").select("id, pic_id").eq("workspace_id", workspaceId),
  ]);
  let campaignAuditColumnsAvailable = true;
  let existingCampaignRows: Array<{ id: string; owner_id: string | null; created_by?: string | null }>;
  if (existingCampaignAuditResult.error && isMissingCampaignAuditColumn(existingCampaignAuditResult.error)) {
    campaignAuditColumnsAvailable = false;
    const legacyCampaignResult = await client.from("campaigns").select("id, owner_id").eq("workspace_id", workspaceId);
    if (legacyCampaignResult.error) throw legacyCampaignResult.error;
    existingCampaignRows = legacyCampaignResult.data ?? [];
  } else {
    if (existingCampaignAuditResult.error) throw existingCampaignAuditResult.error;
    existingCampaignRows = existingCampaignAuditResult.data ?? [];
  }
  if (existingTaskResult.error) throw existingTaskResult.error;
  if (existingRequestResult.error && !isMissingOperationalTable(existingRequestResult.error)) throw existingRequestResult.error;

  const existingCampaignById = new Map(existingCampaignRows.map((campaign) => [campaign.id, campaign]));
  const existingTaskById = new Map((existingTaskResult.data ?? []).map((task) => [task.id, task]));
  const existingRequestById = new Map((existingRequestResult.data ?? []).map((request) => [request.id, request]));
  const campaigns = data.campaigns
    .filter((campaign) => typeof campaign.id === "string")
    .map((campaign) => {
      const existingCampaign = existingCampaignById.get(campaign.id as string);
      return {
        id: campaign.id,
        workspace_id: workspaceId,
        name: campaign.name,
        brand: campaign.brand,
        objective: campaign.objective || null,
        kpi: campaign.kpi,
        budget: campaign.budget,
        spent: campaign.spent,
        status: campaign.status,
        progress: campaign.progress,
        owner_id: existingCampaign?.owner_id ?? null,
        ...(campaignAuditColumnsAvailable ? {
          created_by: existingCampaign?.created_by ?? userId,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        } : {}),
        start_date: campaign.startDate || null,
        end_date: campaign.endDate || null,
        lifecycle_status: campaign.lifecycleStatus,
        archived_at: campaign.archivedAt || null,
        archived_by: campaign.archivedBy || null,
        deleted_at: campaign.deletedAt || null,
        deleted_by: campaign.deletedBy || null,
        previous_lifecycle_status: campaign.previousLifecycleStatus || null,
      };
    });

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
      assignee_id: existingTaskById.get(task.id)?.assignee_id ?? userId,
      created_by: existingTaskById.get(task.id)?.created_by ?? userId,
      updated_at: new Date().toISOString(),
    }));

  const campaignIdByName = new Map(data.campaigns.map((campaign) => [campaign.name, campaign.id]));
  const influencerSchedules = data.influencerSchedules
    .filter((schedule) => typeof schedule.id === "string")
    .map((schedule) => {
      const campaignId = isUuid(schedule.campaignId) ? schedule.campaignId : campaignIdByName.get(schedule.campaign);
      return {
        id: schedule.id,
        workspace_id: workspaceId,
        influencer_name: schedule.influencer,
        platform: schedule.platform.toLowerCase(),
        campaign_id: isUuid(campaignId) ? campaignId : null,
        content_title: schedule.content,
        scheduled_at: `${schedule.date}T${schedule.time || "00:00"}:00+07:00`,
        status: schedule.status,
        rate: schedule.rate,
        spent: schedule.spent,
        payment_status: schedule.paymentStatus,
        notes: schedule.notes || null,
        created_by: userId,
        updated_at: new Date().toISOString(),
      };
    });

  const platformToDatabase = { Instagram: "instagram", Facebook: "facebook", Threads: "threads", TikTok: "tiktok" } as const;
  const accountIdByPlatform = new Map(data.socialAccounts.map((account) => [account.platform, account.id]));
  const socialPosts = data.content
    .filter((content) => typeof content.id === "string")
    .map((content) => {
      const platform = platformToDatabase[content.platform];
      const accountId = accountIdByPlatform.get(platform);
      if (!accountId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId)) return null;
      return {
        id: content.id,
        workspace_id: workspaceId,
        social_account_id: accountId,
        title: content.title,
        caption: content.caption || null,
        media_url: content.mediaUrl || null,
        media_type: content.mediaType || "feed",
        status: content.status === "Tayang" ? "published" : content.status === "Terjadwal" ? "scheduled" : "draft",
        provider_status: content.status === "Tayang" ? "published" : "pending",
        scheduled_at: content.scheduledAt || null,
        created_by: userId,
      };
    })
    .filter((post): post is NonNullable<typeof post> => Boolean(post));
  const requests = data.requests
    .filter((request) => isUuid(request.id))
    .map((request) => ({
      id: request.id,
      workspace_id: workspaceId,
      title: request.title,
      sender: request.sender,
      request_date: normalizeDate(request.date),
      brand: request.brand,
      priority: request.priority,
      status: request.status,
      pic_id: existingRequestById.get(request.id)?.pic_id ?? null,
      icon: request.icon,
      updated_at: new Date().toISOString(),
    }));
  const influencers = data.influencers
    .filter((influencer) => isUuid(influencer.id))
    .map((influencer) => ({
      id: influencer.id,
      workspace_id: workspaceId,
      name: influencer.name,
      platform: influencer.platform.toLowerCase(),
      niche: influencer.niche,
      rate: influencer.rate,
      followers: influencer.followers,
      engagement: influencer.engagement,
      status: influencer.status,
      updated_at: new Date().toISOString(),
    }));
  const transactions = data.transactions
    .filter((transaction) => isUuid(transaction.id))
    .map((transaction) => ({
      id: transaction.id,
      workspace_id: workspaceId,
      vendor: transaction.vendor,
      category: transaction.category,
      transaction_date: normalizeDate(transaction.date),
      amount: transaction.amount,
      transaction_type: transaction.type,
      status: transaction.status,
      brand: transaction.brand,
      updated_at: new Date().toISOString(),
    }));
  const socialInboxUpdates = data.socialInbox
    .filter((item) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id))
    .map((item) => client.from("social_inbox").update({ status: item.status, updated_at: new Date().toISOString() }).eq("id", item.id));

  const results = await Promise.all([
    campaigns.length ? client.from("campaigns").upsert(campaigns, { onConflict: "id" }) : Promise.resolve({ error: null }),
    tasks.length ? client.from("tasks").upsert(tasks, { onConflict: "id" }) : Promise.resolve({ error: null }),
    influencerSchedules.length ? client.from("influencer_bookings").upsert(influencerSchedules, { onConflict: "id" }) : Promise.resolve({ error: null }),
    socialPosts.length ? client.from("social_posts").upsert(socialPosts, { onConflict: "id" }) : Promise.resolve({ error: null }),
    requests.length ? client.from("marketing_requests").upsert(requests, { onConflict: "id" }) : Promise.resolve({ error: null }),
    influencers.length ? client.from("marketing_influencers").upsert(influencers, { onConflict: "id" }) : Promise.resolve({ error: null }),
    transactions.length ? client.from("marketing_transactions").upsert(transactions, { onConflict: "id" }) : Promise.resolve({ error: null }),
  ]);

  const error = results.map((result) => result.error).find((result) => result && !isMissingBookingsTable(result) && !isMissingOperationalTable(result)) ?? null;
  if (error) throw error;
  const inboxResults = await Promise.all(socialInboxUpdates);
  const inboxError = inboxResults.map((result) => result.error).find((result) => result && !isMissingSocialHubTable(result)) ?? null;
  if (inboxError) throw inboxError;
}
