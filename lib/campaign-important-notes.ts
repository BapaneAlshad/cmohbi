import type { Campaign, CampaignDiscussionNote, CampaignImportantNote } from "./types.ts";

export function campaignImportantNotes(campaign: Campaign, discussionNotes: CampaignDiscussionNote[]): CampaignImportantNote[] {
  const notes: CampaignImportantNote[] = discussionNotes
    .filter((note) => String(note.campaignId) === String(campaign.id) && note.pinnedToDashboard)
    .map((note) => ({ id: note.id, campaignId: note.campaignId, source: "discussion", authorName: note.authorName, body: note.body, createdAt: note.createdAt }));

  const content = campaign.contentConfig;
  const instructions = content?.instructions?.trim() || "";
  if (content?.instructionsPinned && instructions) {
    notes.push({
      id: `brief:${campaign.id}`,
      campaignId: campaign.id,
      source: "brief",
      authorName: "Brief & Promo",
      body: instructions,
      createdAt: content.instructionsPinnedAt || "",
    });
  }

  return notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
