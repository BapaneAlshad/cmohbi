export type ViewName = "dashboard" | "campaigns" | "todo" | "calendar" | "requests" | "partners" | "influencer-schedule" | "analytics" | "social-hub" | "account";
export type SocialPlatform = "instagram" | "facebook" | "threads" | "tiktok";
export type SocialInboxKind = "comment" | "message";
export type TaskStatus = "Backlog" | "To Do" | "In Progress" | "Review" | "Revisi" | "Done";
export type EntityId = number | string;

export interface Campaign { id: EntityId; name: string; brand: string; pic: string; period: string; status: string; progress: number; budget: number; spent: number; kpi: string; tasks: number; content: number }
export interface Task { id: EntityId; title: string; brand: string; pic: string; due: string; dueDate?: string; priority: string; status: TaskStatus; campaign: EntityId | null }
export interface ContentItem { id: number | string; title: string; date: number; status: string; brand: string; platform: "Instagram" | "Facebook" | "Threads" | "TikTok"; caption?: string; mediaUrl?: string; mediaType?: "feed" | "reel" | "video"; scheduledAt?: string }
export interface RequestItem { id: EntityId; title: string; sender: string; date: string; brand: string; priority: string; status: string; pic?: string; icon: string }
export interface Influencer { id?: EntityId; name: string; platform: "Instagram" | "Facebook" | "TikTok"; niche: string; rate: number; followers: string; engagement: string; status: string }
export interface InfluencerSchedule { id: EntityId; influencer: string; platform: "Instagram" | "Facebook" | "TikTok"; campaign: string; content: string; date: string; time: string; status: string; rate: number; spent: number; paymentStatus: string; notes?: string }
export interface Transaction { id?: EntityId; category: string; vendor: string; date: string; amount: number; type: string; status: string; brand: string }
export interface User { name: string; username: string; email: string; whatsapp: string; role: string; status: string }
export interface UserIdentity { name: string; username: string; email: string; whatsapp: string; role: string }
export interface Metric { current: number; previous: number; target: number; unit: "number" | "percent"; }
export interface SocialAccount { id: string; platform: SocialPlatform; name: string; handle: string; status: "connected" | "needs_attention" | "disconnected"; lastSync: string | null; followers: number }
export interface SocialSnapshot { platform: SocialPlatform; date: string; followers: number; reach: number; impressions: number; engagementRate: number; views: number }
export interface SocialPost { id: string; platform: SocialPlatform; title: string; publishedAt: string; reach: number; engagementRate: number; status: "published" | "scheduled" | "draft" }
export interface SocialInboxItem { id: string; platform: SocialPlatform; kind: SocialInboxKind; author: string; body: string; postTitle?: string; occurredAt: string; status: "unread" | "open" | "resolved"; canReply: boolean }

export interface AppData {
  campaigns: Campaign[];
  tasks: Task[];
  content: ContentItem[];
  requests: RequestItem[];
  influencers: Influencer[];
  influencerSchedules: InfluencerSchedule[];
  transactions: Transaction[];
  users: User[];
  socialAccounts: SocialAccount[];
  socialSnapshots: SocialSnapshot[];
  socialPosts: SocialPost[];
  socialInbox: SocialInboxItem[];
}
