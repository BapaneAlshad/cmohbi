import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspaceRole, AppData } from "@/lib/types";
import { loadWorkspaceData } from "@/lib/supabase/workspace-data";
import { emptyWorkspaceData } from "@/lib/production-policy";
import { APPROVED_OBSIDIAN_MARKETING_PATHS, filterMarketingMemoryDocuments } from "@/lib/hermes-memory";
import { buildHermesTaskContext } from "@/lib/hermes-task-context";

const MAX_CONTEXT_CHARS = 36_000;

function cleanText(value: unknown, max = 800) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanDate(value: unknown) {
  return cleanText(value, 40);
}

function truncateJson(value: unknown) {
  const json = JSON.stringify(value);
  if (json.length <= MAX_CONTEXT_CHARS) return json;
  let partial = json;
  while (JSON.stringify({ truncated: true, partialContext: partial }).length > MAX_CONTEXT_CHARS) {
    partial = partial.slice(0, Math.floor(partial.length * 0.9));
  }
  return JSON.stringify({ truncated: true, partialContext: partial });
}

function safeCampaigns(data: AppData, includeAmounts: boolean) {
  return data.campaigns.map((campaign) => ({
    id: campaign.id,
    name: cleanText(campaign.name, 160),
    brand: cleanText(campaign.brand, 100),
    status: cleanText(campaign.status, 40),
    lifecycle: campaign.lifecycleStatus,
    period: cleanText(campaign.period, 80),
    objective: cleanText(campaign.objective, 600),
    kpi: cleanText(campaign.kpi, 500),
    progress: campaign.progress,
    ...(includeAmounts ? { budget: campaign.budget, spent: campaign.spent } : {}),
    brief: campaign.contentConfig ? {
      tagline: cleanText(campaign.contentConfig.tagline, 220),
      bigMessage: cleanText(campaign.contentConfig.bigMessage, 1_200),
      intro: cleanText(campaign.contentConfig.intro, 1_000),
      instructions: cleanText(campaign.contentConfig.instructions, 1_400),
      promos: (Array.isArray(campaign.contentConfig.promos) ? campaign.contentConfig.promos : []).slice(0, 20).map((promo) => ({
        title: cleanText(promo.title, 160),
        period: cleanText(promo.period, 80),
        detail: cleanText(promo.detail, 1_000),
        status: cleanText(promo.status, 40),
      })),
    } : undefined,
  }));
}

function safeBrands(data: AppData, includeAmounts: boolean) {
  return data.brands.map((brand) => ({
    id: brand.id,
    name: cleanText(brand.name, 120),
    description: cleanText(brand.description, 700),
    targetCustomer: cleanText(brand.targetCustomer, 500),
    vision: cleanText(brand.vision, 600),
    mission: cleanText(brand.mission, 600),
    menus: brand.menus.slice(0, 30).map((menu) => ({
      name: cleanText(menu.name, 120),
      ...(includeAmounts ? { hpp: menu.hpp, sellingPrice: menu.sellingPrice } : {}),
    })),
  }));
}

function safeContent(data: AppData) {
  return data.content.map((item) => ({
    id: item.id,
    title: cleanText(item.title, 180),
    platform: item.platform,
    status: cleanText(item.status, 40),
    scheduledAt: cleanDate(item.scheduledAt || item.date),
    caption: cleanText(item.caption, 500),
  }));
}

function safeRequests(data: AppData) {
  return data.requests.map((request) => ({
    id: request.id,
    title: cleanText(request.title, 180),
    brand: cleanText(request.brand, 100),
    date: cleanDate(request.date),
    priority: cleanText(request.priority, 40),
    status: cleanText(request.status, 40),
  }));
}

function safeInfluencers(data: AppData, includeAmounts: boolean) {
  return data.influencers.map((influencer) => ({
    id: influencer.id,
    name: cleanText(influencer.name, 120),
    collaborationType: influencer.collaborationType,
    niche: cleanText(influencer.niche, 120),
    accounts: (influencer.accounts || []).map((account) => ({
      platform: account.platform,
      username: cleanText(account.username, 120),
      followers: account.followers,
    })),
    rateCards: (influencer.rateCards || []).map((card) => ({
      name: cleanText(card.name, 120),
      platform: card.platform,
      details: cleanText(card.details, 600),
      ...(includeAmounts ? { amount: card.amount } : {}),
    })),
  }));
}

function safeBookings(data: AppData, includeAmounts: boolean) {
  return data.influencerSchedules.map((booking) => ({
    id: booking.id,
    influencer: cleanText(booking.influencer, 120),
    campaign: cleanText(booking.campaign, 120),
    platform: booking.platform,
    content: cleanText(booking.content, 180),
    date: cleanDate(booking.date),
    status: cleanText(booking.status, 60),
    ...(includeAmounts ? { rate: booking.rate, spent: booking.spent, paymentStatus: booking.paymentStatus } : {}),
  }));
}

export async function buildHermesMarketingContext(
  client: SupabaseClient,
  workspaceId: string,
  role: WorkspaceRole,
  email: string,
  currentUserId: string,
) {
  const data = await loadWorkspaceData(client, workspaceId, emptyWorkspaceData(), email);
  const taskContext = buildHermesTaskContext(data, currentUserId);
  let obsidianMarketingMemory = filterMarketingMemoryDocuments([]);
  if (APPROVED_OBSIDIAN_MARKETING_PATHS.length > 0) {
    const { data: memoryRows, error: memoryError } = await client
      .from("hermes_marketing_memory")
      .select("source_path,title,content,updated_at")
      .eq("workspace_id", workspaceId)
      .eq("scope", "marketing")
      .in("source_path", [...APPROVED_OBSIDIAN_MARKETING_PATHS])
      .order("updated_at", { ascending: false })
      .limit(APPROVED_OBSIDIAN_MARKETING_PATHS.length);
    if (memoryError) throw memoryError;
    obsidianMarketingMemory = filterMarketingMemoryDocuments(memoryRows);
  }
  const includeAmounts = role === "owner" || role === "admin";
  const context = {
    source: "Ngapaya marketing workspace",
    policy: "Gunakan hanya data berikut untuk menjawab pertanyaan. Tugas bulan ini dihitung dari tanggal tenggat dalam rentang bulan berjalan WIB.",
    timezone: taskContext.timezone,
    today: taskContext.today,
    currentMonth: taskContext.currentMonth,
    currentUser: taskContext.currentUser,
    myTasksThisMonth: taskContext.myTasksThisMonth,
    myUndatedTasks: taskContext.myUndatedTasks,
    tasks: taskContext.tasks,
    obsidianMarketingMemory: obsidianMarketingMemory.map((document) => ({
      source: document.sourcePath,
      title: document.title,
      updatedAt: document.updatedAt,
      content: document.content,
    })),
    campaigns: safeCampaigns(data, includeAmounts),
    brands: safeBrands(data, includeAmounts),
    contentCalendar: safeContent(data),
    requests: safeRequests(data),
    influencers: safeInfluencers(data, includeAmounts),
    influencerBookings: safeBookings(data, includeAmounts),
    social: {
      accounts: data.socialAccounts.map((account) => ({ platform: account.platform, name: cleanText(account.name, 120), handle: cleanText(account.handle, 120), status: account.status, followers: account.followers })),
      snapshots: data.socialSnapshots.slice(-120),
      posts: data.socialPosts.slice(-120).map((post) => ({ platform: post.platform, title: cleanText(post.title, 180), publishedAt: cleanDate(post.publishedAt), reach: post.reach, engagementRate: post.engagementRate, status: post.status })),
      inbox: data.socialInbox.slice(0, 120).map((item) => ({ platform: item.platform, kind: item.kind, author: cleanText(item.author, 120), body: cleanText(item.body, 600), postTitle: cleanText(item.postTitle, 180), occurredAt: cleanDate(item.occurredAt), status: item.status })),
    },
    campaignNotes: (data.campaignNotes || []).slice(0, 120).map((note) => ({ campaignId: note.campaignId, author: cleanText(note.authorName, 120), body: cleanText(note.body, 900), createdAt: cleanDate(note.createdAt) })),
    ...(includeAmounts ? {
      transactions: data.transactions.map((transaction) => ({ category: cleanText(transaction.category, 100), vendor: cleanText(transaction.vendor, 140), date: cleanDate(transaction.date), amount: transaction.amount, type: cleanText(transaction.type, 50), status: cleanText(transaction.status, 50), brand: cleanText(transaction.brand, 100) })),
      campaignExpenses: (data.campaignExpenses || []).map((expense) => ({ campaignId: expense.campaignId, category: expense.category, title: cleanText(expense.title, 180), amount: expense.amount, date: cleanDate(expense.date), details: cleanText(expense.details, 500) })),
    } : {}),
  };
  return truncateJson(context);
}

