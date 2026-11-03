import type { SupabaseClient } from "@supabase/supabase-js";
import type { Campaign, CampaignInfluencerBookingPatch, CampaignInfluencerTheme, CampaignInfluencerThemeInput, EntityId, InfluencerPaymentStatus, InfluencerSchedule } from "@/lib/types";

type SavedRow = Record<string, unknown>;

async function save(client: SupabaseClient, name: string, campaignId: EntityId, input: object, id?: EntityId) {
  const result = await client.rpc(name, { p_campaign_id: campaignId, p_id: id ?? null, p_input: input });
  if (result.error) throw new Error(result.error.code === "PGRST202" ? "Fitur penyimpanan influencer Campaign belum tersedia. Hubungi Super Admin untuk memperbarui database." : result.error.message);
  if (!result.data || typeof result.data !== "object") throw new Error("Hasil penyimpanan influencer tidak valid.");
  return result.data as SavedRow;
}

export async function persistCampaignInfluencerTheme(client: SupabaseClient, campaignId: EntityId, input: CampaignInfluencerThemeInput, id?: EntityId): Promise<CampaignInfluencerTheme> {
  const row = await save(client, "save_campaign_influencer_theme", campaignId, input, id);
  return { id: String(row.id), campaignId: String(row.campaign_id), code: String(row.code), name: String(row.name), phase: String(row.phase || ""), objective: String(row.objective || ""), requiredContent: String(row.required_content || ""), cta: String(row.cta || "") };
}

export async function persistCampaignInfluencerThemeDelete(client: SupabaseClient, campaignId: EntityId, id: EntityId) {
  const { error } = await client.rpc("delete_campaign_influencer_theme", { p_campaign_id: campaignId, p_theme_id: id });
  if (error) throw new Error(error.code === "PGRST202" ? "Fitur hapus tema Campaign belum tersedia. Terapkan migrasi database terbaru." : error.message);
}

export async function persistCampaignInfluencerBookingDelete(client: SupabaseClient, campaignId: EntityId, id: EntityId) {
  const { error } = await client.rpc("delete_campaign_influencer_booking", { p_campaign_id: campaignId, p_booking_id: id });
  if (error) throw new Error(error.code === "PGRST202" ? "Fitur hapus jadwal Campaign belum tersedia. Terapkan migrasi database terbaru." : error.message);
}

export async function persistCampaignInfluencerPayment(client: SupabaseClient, campaignId: EntityId, id: EntityId, status: InfluencerPaymentStatus, amount: number): Promise<InfluencerSchedule> {
  const result = await client.rpc("set_campaign_influencer_payment", { p_campaign_id: campaignId, p_booking_id: id, p_payment_status: status, p_amount: amount });
  if (result.error) throw new Error(result.error.code === "PGRST202" ? "Fitur pembayaran influencer belum tersedia. Terapkan migrasi database terbaru." : result.error.message);
  if (!result.data || typeof result.data !== "object") throw new Error("Hasil penyimpanan pembayaran tidak valid.");
  const row = result.data as SavedRow;
  return {
    id: String(row.id), campaignId: String(row.campaign_id), campaign: String(row.campaign_name || ""),
    influencer: String(row.influencer_name), influencerId: row.influencer_id ? String(row.influencer_id) : null,
    platform: row.platform === "instagram" ? "Instagram" : row.platform === "facebook" ? "Facebook" : "TikTok",
    themeId: row.campaign_influencer_theme_id ? String(row.campaign_influencer_theme_id) : null,
    themeName: row.theme_name ? String(row.theme_name) : undefined,
    visitDate: row.visit_date ? String(row.visit_date) : null, uploadDate: row.upload_date ? String(row.upload_date) : null,
    content: String(row.content_title), contentLink: row.content_link ? String(row.content_link) : null, date: String(row.upload_date || row.visit_date || ""),
    time: String(row.scheduled_time || "00:00"), rate: Number(row.rate), spent: Number(row.spent),
    status: String(row.status), paymentStatus: String(row.payment_status), notes: row.notes ? String(row.notes) : undefined,
  };
}

export async function persistCampaignInfluencerBooking(client: SupabaseClient, campaign: Campaign, input: CampaignInfluencerBookingPatch, id?: EntityId): Promise<InfluencerSchedule> {
  const row = await save(client, "save_campaign_influencer_booking", campaign.id, input, id);
  return {
    id: String(row.id), campaignId: campaign.id, campaign: campaign.name,
    influencer: String(row.influencer_name), influencerId: row.influencer_id ? String(row.influencer_id) : null,
    platform: row.platform === "instagram" ? "Instagram" : row.platform === "facebook" ? "Facebook" : "TikTok",
    themeId: row.campaign_influencer_theme_id ? String(row.campaign_influencer_theme_id) : null,
    themeName: row.theme_name ? String(row.theme_name) : undefined,
    visitDate: row.visit_date ? String(row.visit_date) : null, uploadDate: row.upload_date ? String(row.upload_date) : null,
    content: String(row.content_title), contentLink: row.content_link ? String(row.content_link) : null, date: String(row.upload_date || row.visit_date || ""),
    time: String(row.scheduled_time || "00:00"), rate: Number(row.rate), spent: Number(row.spent),
    status: String(row.status), paymentStatus: String(row.payment_status), notes: row.notes ? String(row.notes) : undefined,
  };
}
