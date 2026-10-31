import { mapPendingRequest } from "./task-board-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppData, CampaignTimelineConfig, ContentItem, EntityId, TaskStatus } from "@/lib/types";
import { formatCampaignPeriod } from "@/lib/campaign-form";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format";
import { normalizeAccessRole, profileJobTitle } from "@/lib/user-management";

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
  return formatDisplayDate(value, { empty: "Belum dijadwalkan" });
}

function isMissingBookingsTable(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.message?.includes("influencer_bookings");
}

function isMissingCampaignThemesTable(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || error?.code === "PGRST205"
    || (message.includes("campaign_influencer_themes") && (message.includes("does not exist") || message.includes("schema cache") || message.includes("could not find the table")));
}

function isMissingSocialHubTable(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.message?.includes("social_inbox");
}

function isMissingOperationalTable(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || ["marketing_requests", "marketing_influencers", "marketing_transactions"].some((table) => message.includes(table));
}

function isMissingBrandTable(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || ["relation \"brands\"", "relation \"brand_menus\"", "brands", "brand_menus"].some((table) => message.includes(table));
}

function isMissingTaskAssigneesTable(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || error?.code === "PGRST205"
    || (message.includes("task_assignees") && (message.includes("does not exist") || message.includes("schema cache") || message.includes("could not find the table")));
}

function isMissingNotificationsTable(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || error?.code === "PGRST205" || message.includes("notifications") && (message.includes("does not exist") || message.includes("schema cache") || message.includes("could not find the table"));
}

function isMissingDashboardNotes(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || error?.code === "PGRST205"
    || ["campaign_members", "campaign_notes", "admin_dashboard_notes", "admin_dashboard_note_recipients"].some((table) => message.includes(table) && (message.includes("does not exist") || message.includes("schema cache") || message.includes("could not find the table")));
}

function isMissingTaskCalendarColumn(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (error?.code === "42703" || error?.code === "PGRST204") && message.includes("content_calendar_type");
}

function isMissingCampaignAuditColumn(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42703"
    || error?.code === "PGRST204"
    || ["created_by", "updated_by", "updated_at"].some((column) => message.includes(column));
}

function isMissingCampaignPresentationColumn(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (error?.code === "42703" || error?.code === "PGRST204")
    && ["avatar_url", "timeline_config"].some((column) => message.includes(column));
}

function normalizeCampaignTimelineConfig(value: unknown): CampaignTimelineConfig | null {
  if (!value || typeof value !== "object") return null;
  const config = value as Partial<CampaignTimelineConfig>;
  return {
    phaseMode: config.phaseMode === true,
    phases: Array.isArray(config.phases) ? config.phases : [],
    taskPhase: config.taskPhase && typeof config.taskPhase === "object" ? config.taskPhase as Record<string, string> : {},
  };
}

async function upsertCampaignRows(client: SupabaseClient, campaigns: Array<Record<string, unknown>>) {
  const result = await client.from("campaigns").upsert(campaigns, { onConflict: "id" });
  if (!isMissingCampaignPresentationColumn(result.error)) return result;
  const legacyRows = campaigns.map((campaign) => Object.fromEntries(
    Object.entries(campaign).filter(([column]) => column !== "avatar_url" && column !== "timeline_config"),
  ));
  return client.from("campaigns").upsert(legacyRows, { onConflict: "id" });
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
  const [campaignResult, taskResult, memberResult, bookingResult, themeResult, accountResult, metricResult, postResult, inboxResult, requestResult, influencerResult, transactionResult, brandResult, brandMenuResult, notificationResult, campaignMembersResult, campaignNotesResult, adminNotesResult, adminNoteRecipientsResult] = await Promise.all([
    client.from("campaigns").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
    client.from("tasks").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: true }),
    client.from("workspace_members").select("user_id, role").eq("workspace_id", workspaceId),
    client.from("influencer_bookings").select("*").eq("workspace_id", workspaceId).order("scheduled_at", { ascending: true }),
    client.from("campaign_influencer_themes").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: true }),
    client.from("social_accounts").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: true }),
    client.from("social_metric_snapshots").select("*").eq("workspace_id", workspaceId).order("captured_at", { ascending: true }),
    client.from("social_posts").select("*").eq("workspace_id", workspaceId).order("scheduled_at", { ascending: true }),
    client.from("social_inbox").select("*").eq("workspace_id", workspaceId).order("occurred_at", { ascending: false }),
    client.from("marketing_requests").select("*").eq("workspace_id", workspaceId).order("request_date", { ascending: false }),
    client.from("marketing_influencers").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
    client.from("marketing_transactions").select("*").eq("workspace_id", workspaceId).order("transaction_date", { ascending: false }),
    client.from("brands").select("*").eq("workspace_id", workspaceId).order("name", { ascending: true }),
    client.from("brand_menus").select("*").eq("workspace_id", workspaceId).order("name", { ascending: true }),
    client.from("notifications").select("id, kind, title, body, created_at, read_at, task_id, campaign_id").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(100),
    client.from("campaign_members").select("campaign_id,user_id").eq("workspace_id", workspaceId),
    client.from("campaign_notes").select("id,campaign_id,author_id,author_name,body,reply_to,pinned_to_dashboard,created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
    client.from("admin_dashboard_notes").select("id,title,body,created_by,created_by_name,expires_at,is_active,created_at,updated_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
    client.from("admin_dashboard_note_recipients").select("note_id,user_id").eq("workspace_id", workspaceId),
  ]);

  const firstError = campaignResult.error || taskResult.error || memberResult.error;
  if (firstError) throw firstError;

  const taskRequestsResult = await client.from("task_status_requests").select("*").eq("workspace_id", workspaceId).eq("state", "pending");

  const memberIds = (memberResult.data ?? []).map((member) => member.user_id);
  const profileResult = memberIds.length
    ? await client.from("profiles").select("id, full_name, username, email, whatsapp, job_title, avatar_url").in("id", memberIds)
    : { data: [], error: null };

  if (profileResult.error) throw profileResult.error;
  for (const result of [campaignMembersResult, campaignNotesResult, adminNotesResult, adminNoteRecipientsResult]) {
    if (result.error && !isMissingDashboardNotes(result.error)) throw result.error;
  }

  const profileById = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile]));
  const recipientsByNote = new Map<string, string[]>();
  if (!adminNoteRecipientsResult.error) for (const recipient of adminNoteRecipientsResult.data ?? []) {
    recipientsByNote.set(recipient.note_id, [...(recipientsByNote.get(recipient.note_id) || []), recipient.user_id]);
  }
  const campaignRows = campaignResult.data ?? [];
  const taskRows = taskResult.data ?? [];
  const taskAssigneeResult = taskRows.length
    ? await client.from("task_assignees").select("task_id, user_id").in("task_id", taskRows.map((task) => task.id))
    : { data: [], error: null };
  if (taskAssigneeResult.error && !isMissingTaskAssigneesTable(taskAssigneeResult.error)) throw taskAssigneeResult.error;
  const assigneesByTask = new Map<string, string[]>();
  if (!taskAssigneeResult.error) {
    for (const row of taskAssigneeResult.data ?? []) assigneesByTask.set(row.task_id, [...(assigneesByTask.get(row.task_id) ?? []), row.user_id]);
  }
  const campaignById = new Map(campaignRows.map((campaign) => [campaign.id, campaign]));
  if (themeResult.error && !isMissingCampaignThemesTable(themeResult.error)) throw themeResult.error;
  const brandRows = brandResult.error || brandMenuResult.error ? [] : (brandResult.data ?? []);
  const brandNameById = new Map(brandRows.map((brand) => [brand.id, brand.name]));
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
    lastSync: account.last_sync_at ? formatDisplayDateTime(account.last_sync_at) : null,
    followers: Number(latestMetricByAccount.get(account.id)?.followers ?? 0),
  }));
  const accountById = new Map(accountRows.map((account) => [account.id, account]));
  const metrics = metricResult.error ? fallback.socialSnapshots : liveMetricRows.map((metric) => ({
    platform: accountById.get(metric.social_account_id)?.platform ?? "instagram",
    date: formatDisplayDate(metric.captured_at),
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
    occurredAt: formatDisplayDateTime(item.occurred_at),
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
    brand: brandNameById.get(transaction.brand_id) ?? transaction.brand,
    brandId: transaction.brand_id || null,
  }));
  const brands = brandResult.error || brandMenuResult.error
    ? fallback.brands
    : (brandResult.data ?? []).map((brand) => ({
      id: brand.id,
      name: brand.name,
      openingDate: brand.opening_date,
      primaryColor: brand.primary_color,
      description: brand.description || "",
      targetCustomer: brand.target_customer || "",
      vision: brand.vision || "",
      mission: brand.mission || "",
      logoUrl: brand.logo_url || null,
      outletImageUrl: brand.outlet_image_url || null,
      websiteUrl: brand.website_url || null,
      proposalUrl: brand.proposal_url || null,
      importantDataUrl: brand.important_data_url || null,
      menus: (brandMenuResult.data ?? []).filter((menu) => menu.brand_id === brand.id).map((menu) => ({ id: menu.id, name: menu.name, hpp: Number(menu.hpp), sellingPrice: Number(menu.selling_price) })),
    }));

  return {
    ...fallback,
    brands,
    content,
    socialAccounts: accountRows,
    socialSnapshots: metrics,
    socialPosts: posts,
    socialInbox: inbox,
    requests,
    influencers,
    transactions,
    campaignMembers: campaignMembersResult.error ? [] : (campaignMembersResult.data ?? []).map((item) => ({ campaignId: item.campaign_id, userId: item.user_id })),
    campaignNotes: campaignNotesResult.error ? [] : (campaignNotesResult.data ?? []).map((item) => ({ id: item.id, campaignId: item.campaign_id, authorId: item.author_id, authorName: item.author_name, body: item.body, replyTo: item.reply_to, pinnedToDashboard: item.pinned_to_dashboard, createdAt: item.created_at })),
    adminDashboardNotes: adminNotesResult.error ? [] : (adminNotesResult.data ?? []).map((item) => ({ id: item.id, title: item.title, body: item.body, createdBy: item.created_by, createdByName: item.created_by_name, recipientIds: recipientsByNote.get(item.id) || [], expiresAt: item.expires_at, isActive: item.is_active, createdAt: item.created_at, updatedAt: item.updated_at })),
    campaigns: campaignRows.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      brand: brandNameById.get(campaign.brand_id) ?? campaign.brand,
      brandId: campaign.brand_id || null,
      avatarUrl: campaign.avatar_url || null,
      timelineConfig: normalizeCampaignTimelineConfig(campaign.timeline_config),
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
      brand: brandNameById.get(task.brand_id) ?? campaignById.get(task.campaign_id)?.brand ?? "HBI",
      brandId: task.brand_id || null,
      pic: profileById.get(task.assignee_id)?.full_name ?? "Belum ditentukan",
      assigneeIds: taskAssigneeResult.error ? (task.assignee_id ? [task.assignee_id] : []) : assigneesByTask.get(task.id) ?? (task.assignee_id ? [task.assignee_id] : []),
      due: formatDate(task.due_date),
      dueDate: task.due_date || undefined,
      contentCalendarType: task.content_calendar_type === "feed_carousel" || task.content_calendar_type === "reels" ? task.content_calendar_type : undefined,
      priority: task.priority,
      isPriority: task.is_priority ?? task.priority === "Tinggi",
      pendingStatusRequest: (() => { const request = (taskRequestsResult.data || []).find((item) => item.task_id === task.id); return request ? mapPendingRequest({ ...request, requested_by_name: profileById.get(request.requested_by)?.full_name }, []) : null; })(),
      status: taskStatusFromDatabase[task.status] ?? "Backlog",
      campaign: task.campaign_id,
    })),
    influencerSchedules: bookingResult.error && isMissingBookingsTable(bookingResult.error)
      ? fallback.influencerSchedules
      : (bookingResult.data ?? []).map((booking) => ({
        id: booking.id,
        influencer: booking.influencer_name,
        influencerId: booking.influencer_id === undefined ? undefined : booking.influencer_id || null,
        platform: booking.platform === "instagram" ? "Instagram" : booking.platform === "facebook" ? "Facebook" : "TikTok",
        campaign: campaignById.get(booking.campaign_id)?.name ?? "Tanpa campaign",
        campaignId: booking.campaign_id || null,
        themeId: booking.campaign_influencer_theme_id === undefined ? undefined : booking.campaign_influencer_theme_id || null,
        themeName: (themeResult.data ?? []).find((theme) => theme.id === booking.campaign_influencer_theme_id)?.name,
        visitDate: booking.visit_date === undefined ? undefined : booking.visit_date || null,
        uploadDate: booking.upload_date === undefined ? undefined : booking.upload_date || null,
        content: booking.content_title,
        date: String(booking.scheduled_at).slice(0, 10),
        time: String(booking.scheduled_at).slice(11, 16),
        status: booking.status,
        rate: Number(booking.rate),
        spent: Number(booking.spent),
        paymentStatus: booking.payment_status,
        notes: booking.notes || undefined,
      })),
    influencerThemes: themeResult.error ? fallback.influencerThemes : (themeResult.data ?? []).map((theme) => ({ id: theme.id, campaignId: theme.campaign_id, code: theme.code, name: theme.name, phase: theme.phase || "", objective: theme.objective || "", requiredContent: theme.required_content || "", cta: theme.cta || "" })),
    users: (memberResult.data ?? []).map((member, index) => {
      const profile = profileById.get(member.user_id);
      return {
        id: member.user_id,
        name: profile?.full_name ?? "Anggota tim",
        username: profile?.username ?? "",
        email: profile?.email || "",
        whatsapp: profile?.whatsapp ?? "",
        role: profileJobTitle(profile?.job_title || (["owner", "admin"].includes(member.role) ? "Super Admin" : "Anggota tim")),
        accessRole: normalizeAccessRole(member.role),
        status: "Aktif",
        avatarUrl: profile?.avatar_url || null,
      };
    }),
    notifications: notificationResult.error && isMissingNotificationsTable(notificationResult.error)
      ? (fallback.notifications ?? [])
      : (notificationResult.data ?? []).map((notification) => ({
        id: notification.id,
        kind: notification.kind,
        title: notification.title,
        body: notification.body,
        createdAt: notification.created_at,
        readAt: notification.read_at,
        taskId: notification.task_id,
        campaignId: notification.campaign_id,
        target: notification.kind === "campaign_changed" ? "campaigns" : "todo",
      })),
  };
}

export async function saveWorkspaceData(
  client: SupabaseClient,
  workspaceId: string,
  userId: string,
  data: AppData,
) {
  const [existingCampaignAuditResult, existingTaskResult, existingRequestResult, existingBrandResult, existingBrandMenuResult] = await Promise.all([
    client.from("campaigns").select("id, owner_id, created_by, spent").eq("workspace_id", workspaceId),
    client.from("tasks").select("id, assignee_id, created_by").eq("workspace_id", workspaceId),
    client.from("marketing_requests").select("id, pic_id").eq("workspace_id", workspaceId),
    client.from("brands").select("id").eq("workspace_id", workspaceId),
    client.from("brand_menus").select("id").eq("workspace_id", workspaceId),
  ]);
  let campaignAuditColumnsAvailable = true;
  let existingCampaignRows: Array<{ id: string; owner_id: string | null; created_by?: string | null; spent: number }>;
  if (existingCampaignAuditResult.error && isMissingCampaignAuditColumn(existingCampaignAuditResult.error)) {
    campaignAuditColumnsAvailable = false;
    const legacyCampaignResult = await client.from("campaigns").select("id, owner_id, spent").eq("workspace_id", workspaceId);
    if (legacyCampaignResult.error) throw legacyCampaignResult.error;
    existingCampaignRows = legacyCampaignResult.data ?? [];
  } else {
    if (existingCampaignAuditResult.error) throw existingCampaignAuditResult.error;
    existingCampaignRows = existingCampaignAuditResult.data ?? [];
  }
  if (existingTaskResult.error) throw existingTaskResult.error;
  if (existingRequestResult.error && !isMissingOperationalTable(existingRequestResult.error)) throw existingRequestResult.error;
  if (existingBrandResult.error && !isMissingBrandTable(existingBrandResult.error)) throw existingBrandResult.error;
  if (existingBrandMenuResult.error && !isMissingBrandTable(existingBrandMenuResult.error)) throw existingBrandMenuResult.error;

  const existingCampaignById = new Map(existingCampaignRows.map((campaign) => [campaign.id, campaign]));
  const existingTaskById = new Map((existingTaskResult.data ?? []).map((task) => [task.id, task]));
  const existingRequestById = new Map((existingRequestResult.data ?? []).map((request) => [request.id, request]));
  const brandIdByName = new Map((data.brands || []).map((brand) => [brand.name, brand.id]));
  const brandPersistenceAvailable = !existingBrandResult.error && !existingBrandMenuResult.error;
  const campaigns = data.campaigns
    .filter((campaign) => typeof campaign.id === "string")
    .map((campaign) => {
      const existingCampaign = existingCampaignById.get(campaign.id as string);
      return {
        id: campaign.id,
        workspace_id: workspaceId,
        name: campaign.name,
        brand: campaign.brand,
        ...(brandPersistenceAvailable ? { brand_id: brandIdByName.get(campaign.brand) || campaign.brandId || null } : {}),
        objective: campaign.objective || null,
        kpi: campaign.kpi,
        budget: campaign.budget,
        // Payment RPCs and booking triggers own realized spend. Re-read the DB value
        // so this broad workspace autosave cannot restore a stale client amount.
        spent: Number(existingCampaign?.spent ?? campaign.spent),
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
        avatar_url: campaign.avatarUrl || null,
        ...(!existingCampaign ? { timeline_config: campaign.timelineConfig || { phaseMode: false, phases: [], taskPhase: {} } } : {}),
      };
    });

  const desiredTaskAssignees = data.tasks
    .filter((task) => typeof task.id === "string" && !existingTaskById.has(task.id))
    .flatMap((task) => {
      const selectedIds = task.assigneeIds ?? (task.pic && task.pic !== "Belum ditentukan"
        ? [data.users.find((user) => user.name === task.pic || user.username === task.pic)?.id ?? ""]
        : []);
      return [...new Set(selectedIds.filter(isUuid))].map((userId) => ({ task_id: task.id as string, user_id: userId }));
    });

  const tasks = data.tasks
    .filter((task) => typeof task.id === "string" && !existingTaskById.has(task.id))
    .map((task) => ({
      id: task.id,
      workspace_id: workspaceId,
      campaign_id: typeof task.campaign === "string" ? task.campaign : null,
      title: task.title,
      ...(brandPersistenceAvailable ? { brand_id: brandIdByName.get(task.brand) || task.brandId || null } : {}),
      status: taskStatusToDatabase[task.status],
      priority: task.priority,
      due_date: task.dueDate || (/^\d{4}-\d{2}-\d{2}$/.test(task.due) ? task.due : null),
      ...(task.contentCalendarType ? { content_calendar_type: task.contentCalendarType } : {}),
      assignee_id: task.assigneeIds
        ? (desiredTaskAssignees.find((assignee) => assignee.task_id === task.id)?.user_id ?? null)
        : (desiredTaskAssignees.find((assignee) => assignee.task_id === task.id)?.user_id ?? existingTaskById.get(task.id)?.assignee_id ?? null),
      created_by: existingTaskById.get(task.id)?.created_by ?? userId,
      updated_at: new Date().toISOString(),
    }));

  // Campaign influencer themes/bookings use explicit transactional saves for all roles.
  // Bulk autosave must not overwrite newer edits made by another team member.

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
      ...(brandPersistenceAvailable ? { brand_id: brandIdByName.get(transaction.brand) || transaction.brandId || null } : {}),
      updated_at: new Date().toISOString(),
    }));
  const brands = (data.brands || []).filter((brand) => isUuid(brand.id)).map((brand) => ({
    id: brand.id,
    workspace_id: workspaceId,
    name: brand.name,
    opening_date: brand.openingDate || null,
    ...(brand.primaryColor !== undefined ? { primary_color: brand.primaryColor || null } : {}),
    description: brand.description || "",
    target_customer: brand.targetCustomer || "",
    vision: brand.vision || "",
    mission: brand.mission || "",
    logo_url: brand.logoUrl || null,
    outlet_image_url: brand.outletImageUrl || null,
    website_url: brand.websiteUrl || null,
    proposal_url: brand.proposalUrl || null,
    important_data_url: brand.importantDataUrl || null,
    created_by: userId,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }));
  const brandMenus = brandPersistenceAvailable ? (data.brands || []).filter((brand) => isUuid(brand.id)).flatMap((brand) => brand.menus.filter((menu) => isUuid(menu.id)).map((menu) => ({
    id: menu.id,
    workspace_id: workspaceId,
    brand_id: brand.id,
    name: menu.name,
    hpp: menu.hpp,
    selling_price: menu.sellingPrice,
    updated_at: new Date().toISOString(),
  }))) : [];
  const savedBrandMenuIds = new Set(brandMenus.map((menu) => menu.id));
  const brandMenuDeletes = !brandPersistenceAvailable
    ? []
    : (existingBrandMenuResult.data ?? []).filter((menu) => !savedBrandMenuIds.has(menu.id)).map((menu) => client.from("brand_menus").delete().eq("id", menu.id).eq("workspace_id", workspaceId));
  const socialInboxUpdates = data.socialInbox
    .filter((item) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id))
    .map((item) => client.from("social_inbox").update({ status: item.status, updated_at: new Date().toISOString() }).eq("id", item.id));

  const taskUpsertResult = tasks.length ? await client.from("tasks").upsert(tasks, { onConflict: "id", ignoreDuplicates: true }).select("id") : { data: [], error: null };
  if (taskUpsertResult.error) {
    if (isMissingTaskCalendarColumn(taskUpsertResult.error) && tasks.some((task) => task.content_calendar_type)) {
      throw new Error("Database belum memiliki jenis jadwal konten. Terapkan migration add_campaign_content_calendar_type terlebih dahulu.");
    }
    throw taskUpsertResult.error;
  }
  const insertedTaskIds = new Set((taskUpsertResult.data || []).map((task) => task.id));
  const initialAssignees = desiredTaskAssignees.filter((row) => insertedTaskIds.has(row.task_id));
  if (initialAssignees.length) {
    const result = await client.from("task_assignees").upsert(initialAssignees, { onConflict: "task_id,user_id", ignoreDuplicates: true });
    if (result.error && !isMissingTaskAssigneesTable(result.error)) throw result.error;
  }
  const influencerUpsertResult = influencers.length ? await client.from("marketing_influencers").upsert(influencers, { onConflict: "id" }) : { error: null };
  if (influencerUpsertResult.error && !isMissingOperationalTable(influencerUpsertResult.error)) throw influencerUpsertResult.error;
  const campaignUpsertResult = campaigns.length ? await upsertCampaignRows(client, campaigns) : { error: null };
  if (campaignUpsertResult.error) throw campaignUpsertResult.error;
  // Timeline configuration is saved explicitly; autosave must not overwrite newer phase edits.
  for (const campaign of data.campaigns.filter((item) => isUuid(item.id) && item.timelineConfig && item.lifecycleStatus === "active")) {
    for (const task of data.tasks.filter((item) => insertedTaskIds.has(String(item.id)) && String(item.campaign) === String(campaign.id))) {
      const phaseId = campaign.timelineConfig!.taskPhase[String(task.id)];
      if (phaseId) {
        const result = await client.rpc("update_marketing_task", { p_task_id: task.id, p_patch: { phase_id: phaseId } });
        if (result.error) throw result.error;
      }
    }
  }

  const results = await Promise.all([
    socialPosts.length ? client.from("social_posts").upsert(socialPosts, { onConflict: "id" }) : Promise.resolve({ error: null }),
    requests.length ? client.from("marketing_requests").upsert(requests, { onConflict: "id" }) : Promise.resolve({ error: null }),
    transactions.length ? client.from("marketing_transactions").upsert(transactions, { onConflict: "id" }) : Promise.resolve({ error: null }),
    brandPersistenceAvailable && brands.length ? client.from("brands").upsert(brands, { onConflict: "id" }) : Promise.resolve({ error: null }),
    brandPersistenceAvailable && brandMenus.length ? client.from("brand_menus").upsert(brandMenus, { onConflict: "id" }) : Promise.resolve({ error: null }),
  ]);

  if (results[3].error?.message?.includes("primary_color")) throw new Error("Kolom warna brand belum tersedia. Terapkan migration brand_colors_and_phase_dates sebelum menyimpan warna.");
  const error = results.map((result) => result.error).find((result) => result && !isMissingBookingsTable(result) && !isMissingOperationalTable(result) && !isMissingBrandTable(result)) ?? null;
  if (error) throw error;
  const inboxResults = await Promise.all(socialInboxUpdates);
  const inboxError = inboxResults.map((result) => result.error).find((result) => result && !isMissingSocialHubTable(result)) ?? null;
  if (inboxError) throw inboxError;
  const brandMenuDeleteResults = await Promise.all(brandMenuDeletes);
  const brandMenuDeleteError = brandMenuDeleteResults.map((result) => result.error).find((result) => result && !isMissingBrandTable(result)) ?? null;
  if (brandMenuDeleteError) throw brandMenuDeleteError;
}
