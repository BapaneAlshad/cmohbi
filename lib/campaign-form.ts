import type { Campaign } from "./types";

export type BasicCampaignInput = {
  name: string;
  brand: string;
  startDate?: string;
  endDate?: string;
  objective?: string;
};

export function validateCampaignPeriod(startDate?: string, endDate?: string) {
  if (startDate && endDate && endDate < startDate) {
    return "Tanggal selesai tidak boleh lebih awal dari tanggal mulai.";
  }
  return null;
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(`${value}T00:00:00`));
}

export function formatCampaignPeriod(startDate?: string | null, endDate?: string | null) {
  if (!startDate && !endDate) return "Periode belum ditentukan";
  if (startDate && endDate) return `${displayDate(startDate)} — ${displayDate(endDate)}`;
  if (startDate) return `Mulai ${displayDate(startDate)}`;
  return `Selesai ${displayDate(endDate as string)}`;
}

export function createBasicCampaign(id: string, input: BasicCampaignInput): Campaign {
  const name = input.name.trim();
  const brand = input.brand.trim();
  if (!name) throw new Error("Nama Campaign wajib diisi.");
  if (!brand) throw new Error("Brand wajib dipilih.");
  const periodError = validateCampaignPeriod(input.startDate, input.endDate);
  if (periodError) throw new Error(periodError);

  return {
    id,
    name,
    brand,
    objective: input.objective?.trim() || "",
    startDate: input.startDate || null,
    endDate: input.endDate || null,
    period: formatCampaignPeriod(input.startDate, input.endDate),
    status: "Rencana",
    progress: 0,
    budget: 0,
    spent: 0,
    kpi: "",
    tasks: 0,
    content: 0,
    lifecycleStatus: "active",
  };
}
