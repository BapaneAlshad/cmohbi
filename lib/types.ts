export type ViewName = "dashboard" | "campaigns" | "brands" | "todo" | "calendar" | "requests" | "partners" | "influencers" | "analytics" | "social-hub" | "account" | "users" | "admin-notes";
export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";
export type SocialPlatform = "instagram" | "facebook" | "threads" | "tiktok";
export type SocialInboxKind = "comment" | "message";
export type TaskStatus = "Backlog" | "To Do" | "In Progress" | "Review" | "Revisi" | "Done";
export type EntityId = number | string;
export type CampaignLifecycle = "active" | "archived" | "trashed";

export type CampaignTimelinePhase = { id: string; name: string; period: string; purpose: string; status?: string; startDate?: string | null; endDate?: string | null; color?: string | null };
export type CampaignTimelineConfig = { phaseMode: boolean; phases: CampaignTimelinePhase[]; taskPhase: Record<string, string> };
export interface CampaignContentConfig { tagline: string; bigMessage: string; intro: string; instructions: string; steps: string[]; promos: Array<{ id: string; title: string; period: string; detail: string; status: string; startDate?: string; endDate?: string }> }
export interface Campaign { rowVersion?: number; contentConfig?: CampaignContentConfig }
export type CampaignSavePatch = Partial<Pick<Campaign, "name" | "brandId" | "objective" | "startDate" | "endDate" | "avatarUrl" | "contentConfig">> & { memberIds?: EntityId[] };
export type SaveCampaign = (id: EntityId, patch: CampaignSavePatch, expectedVersion: number) => Promise<void>;

export interface Campaign { id: EntityId; name: string; brand: string; brandId?: EntityId | null; avatarUrl?: string | null; timelineConfig?: CampaignTimelineConfig | null; objective: string; startDate?: string | null; endDate?: string | null; period: string; status: string; progress: number; budget: number; spent: number; kpi: string; tasks: number; content: number; lifecycleStatus: CampaignLifecycle; archivedAt?: string | null; archivedBy?: string | null; deletedAt?: string | null; deletedBy?: string | null; previousLifecycleStatus?: Exclude<CampaignLifecycle, "trashed"> | null }
export interface CampaignMember { campaignId: EntityId; userId: EntityId }
export interface CampaignDiscussionNote { id: string; campaignId: EntityId; authorId?: EntityId | null; authorName: string; body: string; createdAt: string; replyTo?: string | null; pinnedToDashboard: boolean }
export interface AdminDashboardNote { id: string; title: string; body: string; createdBy?: EntityId | null; createdByName: string; recipientIds: EntityId[]; expiresAt?: string | null; isActive: boolean; createdAt: string; updatedAt?: string }
export interface Task { id: EntityId; title: string; brand: string; brandId?: EntityId | null; pic: string; assigneeIds?: EntityId[]; due: string; dueDate?: string; contentCalendarType?: "feed_carousel" | "reels" | null; priority: string; isPriority?: boolean; status: TaskStatus; campaign: EntityId | null; pendingStatusRequest?: TaskStatusRequest | null }
export interface TaskStatusRequest { id: string; fromStatus: TaskStatus; toStatus: TaskStatus; requestedBy: EntityId; requestedByName: string; createdAt: string }
export interface TaskDraft { title: string; brand: string; campaign: EntityId | null; assigneeIds: EntityId[]; dueDate: string; isPriority: boolean; status: TaskStatus; contentCalendarType: "feed_carousel" | "reels" | null; phaseId?: string }
export interface ContentItem { id: number | string; title: string; date: number; status: string; brand: string; platform: "Instagram" | "Facebook" | "Threads" | "TikTok"; caption?: string; mediaUrl?: string; mediaType?: "feed" | "reel" | "video"; scheduledAt?: string }
export interface RequestItem { id: EntityId; title: string; sender: string; date: string; brand: string; priority: string; status: string; pic?: string; icon: string }
export interface Influencer { id?: EntityId; name: string; platform: "Instagram" | "Facebook" | "TikTok"; niche: string; rate: number; followers: string; engagement: string; status: string }
export interface CampaignInfluencerTheme { id: EntityId; campaignId: EntityId; code: string; name: string; phase: string; objective: string; requiredContent: string; cta: string }
export interface InfluencerSchedule { id: EntityId; influencer: string; influencerId?: EntityId | null; platform: "Instagram" | "Facebook" | "TikTok"; campaign: string; campaignId?: EntityId | null; themeId?: EntityId | null; themeName?: string; visitDate?: string | null; uploadDate?: string | null; content: string; contentLink?: string | null; date: string; time: string; status: string; rate: number; spent: number; paymentStatus: string; notes?: string }
export type InfluencerBookingStatus = "Menunggu konfirmasi" | "Terjadwal" | "Sudah visit" | "Revisi" | "Selesai" | "Dibatalkan";
export type InfluencerPaymentStatus = "Belum dibayar" | "DP dibayar" | "Lunas";
export type CampaignInfluencerThemeInput = Pick<CampaignInfluencerTheme, "name" | "phase" | "objective" | "requiredContent" | "cta">;
export type CampaignInfluencerBookingPatch = { influencerId?: EntityId | null; themeId?: EntityId | null; visitDate?: string | null; uploadDate?: string | null; notes?: string; status?: InfluencerBookingStatus; contentLink?: string | null };
export interface CampaignInfluencerActions {
  saveInfluencerTheme: (campaignId: EntityId, input: CampaignInfluencerThemeInput, id?: EntityId) => Promise<CampaignInfluencerTheme>;
  deleteInfluencerTheme: (campaignId: EntityId, id: EntityId) => Promise<void>;
  saveInfluencerBooking: (campaignId: EntityId, input: CampaignInfluencerBookingPatch, id?: EntityId) => Promise<InfluencerSchedule>;
  deleteInfluencerBooking: (campaignId: EntityId, id: EntityId) => Promise<void>;
  setInfluencerBookingPayment: (campaignId: EntityId, id: EntityId, status: InfluencerPaymentStatus, amount?: number) => Promise<InfluencerSchedule>;
}
export interface Transaction { id?: EntityId; category: string; vendor: string; date: string; amount: number; type: string; status: string; brand: string; brandId?: EntityId | null }
export interface BrandMenu { id: EntityId; name: string; hpp: number; sellingPrice: number }
export interface Brand { id: EntityId; name: string; primaryColor?: string | null; openingDate?: string | null; description: string; targetCustomer: string; vision: string; mission: string; logoUrl?: string | null; outletImageUrl?: string | null; websiteUrl?: string | null; proposalUrl?: string | null; importantDataUrl?: string | null; menus: BrandMenu[] }
export interface User { id?: EntityId; name: string; username: string; email: string; whatsapp: string; role: string; status: string; avatarUrl?: string | null; accessRole?: WorkspaceRole }
export interface UserIdentity { id?: EntityId; name: string; username: string; email: string; whatsapp: string; role: string; accessRole?: WorkspaceRole; avatarUrl?: string | null }
export type TaskPatch = Partial<Pick<Task, "title" | "due" | "dueDate" | "priority" | "isPriority" | "brand" | "brandId" | "campaign" | "status" | "assigneeIds" | "contentCalendarType">> & { phaseId?: string };
export interface CampaignKpi { id: string; campaignId: EntityId; name: string; unit: string; baseline: number; targetIncrease: number; current: number; updatedAt?: string }
export type CampaignKpiInput = Pick<CampaignKpi, "name" | "unit" | "baseline" | "targetIncrease" | "current">;
export interface TaskStatusHistory { id: string; taskId: EntityId; campaignId: EntityId | null; taskTitle: string; actorId?: EntityId | null; actorName: string; fromStatus: TaskStatus; toStatus: TaskStatus; createdAt: string }
export interface InfluencerStatusHistory { id: string; bookingId: EntityId; campaignId: EntityId; influencerName: string; contentLabel: string; actorId?: EntityId | null; actorName: string; fromStatus: string; toStatus: string; createdAt: string }
export interface CampaignActivity { id: string; campaignId: EntityId; kind: "task_status" | "influencer_status"; label: string; actorId?: EntityId | null; actorName: string; fromStatus: string; toStatus: string; createdAt: string }
export interface Metric { current: number; previous: number; target: number; unit: "number" | "percent"; }
export interface SocialAccount { id: string; platform: SocialPlatform; name: string; handle: string; status: "connected" | "needs_attention" | "disconnected"; lastSync: string | null; followers: number }
export interface SocialSnapshot { platform: SocialPlatform; date: string; followers: number; reach: number; impressions: number; engagementRate: number; views: number }
export interface SocialPost { id: string; platform: SocialPlatform; title: string; publishedAt: string; reach: number; engagementRate: number; status: "published" | "scheduled" | "draft" }
export interface SocialInboxItem { id: string; platform: SocialPlatform; kind: SocialInboxKind; author: string; body: string; postTitle?: string; occurredAt: string; status: "unread" | "open" | "resolved"; canReply: boolean }
export type NotificationKind = "task_created" | "task_changed" | "campaign_changed";
export interface NotificationItem { id: string; kind: NotificationKind; title: string; body: string; createdAt: string; readAt?: string | null; taskId?: EntityId | null; campaignId?: EntityId | null; target: "todo" | "campaigns" }

export interface AppData {
  campaignKpis?: CampaignKpi[];
  taskStatusHistory?: TaskStatusHistory[];
  influencerStatusHistory?: InfluencerStatusHistory[];
  campaignMembers?: CampaignMember[];
  campaignNotes?: CampaignDiscussionNote[];
  adminDashboardNotes?: AdminDashboardNote[];
  campaigns: Campaign[];
  brands: Brand[];
  tasks: Task[];
  content: ContentItem[];
  requests: RequestItem[];
  influencers: Influencer[];
  influencerSchedules: InfluencerSchedule[];
  influencerThemes: CampaignInfluencerTheme[];
  transactions: Transaction[];
  users: User[];
  socialAccounts: SocialAccount[];
  socialSnapshots: SocialSnapshot[];
  socialPosts: SocialPost[];
  socialInbox: SocialInboxItem[];
  notifications?: NotificationItem[];
}
