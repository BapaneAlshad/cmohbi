import assert from "node:assert/strict";
import test from "node:test";
import {
  createBasicCampaign,
  formatCampaignPeriod,
  validateCampaignPeriod,
} from "../lib/campaign-form.ts";

test("campaign dasar dapat dibuat tanpa periode dan tanpa data lanjutan dummy", () => {
  const campaign = createBasicCampaign("campaign-1", {
    name: "  Grand Opening RUMA Purwokerto  ",
    brand: "  RUMA  ",
    objective: "  Meningkatkan awareness pembukaan cabang.  ",
  });

  assert.deepEqual(campaign, {
    id: "campaign-1",
    name: "Grand Opening RUMA Purwokerto",
    brand: "RUMA",
    objective: "Meningkatkan awareness pembukaan cabang.",
    startDate: null,
    endDate: null,
    period: "Periode belum ditentukan",
    status: "Rencana",
    progress: 0,
    budget: 0,
    spent: 0,
    kpi: "",
    tasks: 0,
    content: 0,
    lifecycleStatus: "active",
  });
  assert.equal("pic" in campaign, false);
});

test("periode lengkap diformat dan tanggal selesai sebelum mulai ditolak", () => {
  assert.equal(validateCampaignPeriod("2026-10-19", "2026-10-18"), "Tanggal selesai tidak boleh lebih awal dari tanggal mulai.");
  assert.equal(validateCampaignPeriod("2026-10-19", "2026-10-19"), null);
  assert.equal(formatCampaignPeriod("2026-10-19", "2026-10-31"), "19 Okt 2026 — 31 Okt 2026");

  assert.throws(
    () => createBasicCampaign("campaign-2", {
      name: "Campaign tidak valid",
      brand: "HBI",
      startDate: "2026-10-20",
      endDate: "2026-10-19",
    }),
    /Tanggal selesai tidak boleh lebih awal/,
  );
});

test("nama dan brand wajib diisi", () => {
  assert.throws(() => createBasicCampaign("campaign-3", { name: " ", brand: "HBI" }), /Nama Campaign wajib diisi/);
  assert.throws(() => createBasicCampaign("campaign-4", { name: "Peluncuran", brand: " " }), /Brand wajib dipilih/);
});
