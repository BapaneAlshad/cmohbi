import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignExpense, CampaignExpenseInput, EntityId } from "../types.ts";

function mapCampaignExpense(row: Record<string, unknown>): CampaignExpense {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    category: row.category as CampaignExpense["category"],
    title: String(row.title),
    amount: Number(row.amount),
    date: String(row.expense_date),
    details: row.details ? String(row.details) : null,
    createdAt: row.created_at ? String(row.created_at) : undefined,
    createdBy: row.created_by ? String(row.created_by) : null,
  };
}

export async function persistCampaignExpense(
  client: SupabaseClient,
  workspaceId: string,
  campaignId: EntityId,
  id: string,
  input: CampaignExpenseInput,
): Promise<CampaignExpense> {
  const { data, error } = await client.rpc("create_campaign_expense", {
    p_expense_id: id,
    p_workspace_id: workspaceId,
    p_campaign_id: campaignId,
    p_category: input.category,
    p_title: input.title.trim(),
    p_amount: input.amount,
    p_date: input.date,
    p_details: input.details?.trim() || null,
  });
  if (error) {
    if (["42883", "PGRST202", "42P01", "PGRST205"].includes(error.code || "")) {
      throw new Error("Fitur pengeluaran Campaign belum aktif di database. Terapkan migrasi campaign_budget_expenses terlebih dahulu.");
    }
    throw new Error(error.message);
  }
  return mapCampaignExpense(data as Record<string, unknown>);
}

export { mapCampaignExpense };
