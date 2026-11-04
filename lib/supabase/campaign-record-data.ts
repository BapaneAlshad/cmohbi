import type { SupabaseClient } from "@supabase/supabase-js";
import type { Campaign, CampaignSavePatch } from "../types.ts";
import { campaignDatabasePatch, storedCampaign } from "../campaign-persistence.ts";

export class CampaignConflict extends Error {
  latest: Campaign;
  memberIds: string[];
  constructor(latest: Campaign, memberIds: string[] = []) { super("Campaign sudah diubah dari perangkat lain. Tutup form dan buka kembali untuk memakai data terbaru; isian Anda belum disimpan."); this.latest = latest; this.memberIds = memberIds; }
}

export async function persistCampaignRecord(client: SupabaseClient, workspaceId: string, campaign: Campaign, patch: CampaignSavePatch | Record<string, unknown>, expectedVersion: number | null, databasePatch = false): Promise<Campaign> {
  const result = await client.rpc("save_campaign_record", { p_workspace_id: workspaceId, p_campaign_id: campaign.id, p_expected_version: expectedVersion, p_patch: databasePatch ? patch : campaignDatabasePatch(patch as CampaignSavePatch) });
  if (result.error) {
    if ("budget" in patch && result.error.message.includes("Field Campaign tidak diizinkan: budget")) {
      throw new Error("Penyimpanan anggaran belum aktif di database. Terapkan migrasi campaign_budget_expenses terlebih dahulu.");
    }
    if (result.error.code === "40001") {
      const latest = await client.from("campaigns").select("*,campaign_members(user_id)").eq("id", campaign.id).eq("workspace_id", workspaceId).single();
      if (!latest.error) throw new CampaignConflict(storedCampaign(latest.data, campaign), (latest.data.campaign_members || []).map((member: { user_id: string }) => member.user_id));
    }
    if (["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(result.error.code)) throw new Error("Penyimpanan Campaign belum siap. Terapkan migrasi campaign_production_persistence sebelum menyimpan.");
    throw new Error(result.error.message);
  }
  return storedCampaign(result.data, campaign);
}
