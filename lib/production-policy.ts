import type { AppData } from "./types.ts";

// Demo is an explicit development experience, never a fallback for live failures.
export function demoLoginAllowed(environment = process.env.NODE_ENV) {
  return environment !== "production";
}

export function emptyWorkspaceData(): AppData {
  return { campaigns: [], brands: [], tasks: [], content: [], requests: [], influencers: [], influencerSchedules: [], influencerThemes: [], transactions: [], users: [], socialAccounts: [], socialSnapshots: [], socialPosts: [], socialInbox: [], campaignMembers: [], campaignNotes: [], adminDashboardNotes: [], notifications: [], campaignKpis: [], taskStatusHistory: [], influencerStatusHistory: [] };
}
