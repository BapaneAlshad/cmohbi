import assert from "node:assert/strict";
import test from "node:test";
import { formatDisplayDate, formatDisplayDateRange, formatDisplayDateTime, formatTaskDeadline } from "../lib/date-format.ts";
import { campaignPeriodLabel, formatCampaignPeriod } from "../lib/campaign-form.ts";
import { phasePeriodLabel } from "../lib/campaign-timeline.ts";

test("dates use full Indonesian month names, unpadded days and strict calendar validation", () => {
  for (const value of ["2026-10-31", "31 Okt 2026", "31 Oktober 2026", "31/10/2026"]) assert.equal(formatDisplayDate(value), "31 Oktober 2026");
  assert.equal(formatDisplayDate("2026-08-01"), "1 Agustus 2026");
  assert.equal(formatDisplayDate("2028-02-29"), "29 Februari 2028");
  for (const value of ["2026-02-29", "2026-02-30", "2026-13-01", "31 Apr 2026", "2026-02-30T13:00:00Z"]) assert.equal(formatDisplayDate(value), "—");
  assert.equal(formatDisplayDate(null), "—");
  assert.equal(formatDisplayDate("Belum dijadwalkan"), "Belum dijadwalkan");
});

test("date-only strings never shift, timestamps and relative dates follow WIB across year boundaries", () => {
  assert.equal(formatDisplayDate("2026-12-31"), "31 Desember 2026");
  assert.equal(formatDisplayDate("2026-12-31T18:30:00Z"), "1 Januari 2027");
  assert.equal(formatDisplayDateTime("2026-12-31T18:30:00Z"), "1 Januari 2027, 01.30 WIB");
  assert.equal(formatDisplayDateTime("2026-10-31T09:00"), "31 Oktober 2026, 09.00 WIB");
  assert.equal(formatDisplayDateTime("10 Okt 2026, 13:30"), "10 Oktober 2026, 13.30 WIB");
  const now = new Date("2026-12-31T18:30:00Z");
  assert.equal(formatDisplayDate("Hari ini", { now }), "1 Januari 2027");
  assert.equal(formatDisplayDate("Kemarin", { now }), "31 Desember 2026");
  assert.equal(formatDisplayDate("Besok", { now }), "2 Januari 2027");
});

test("legacy task deadlines use campaign year while explicit due dates remain authoritative", () => {
  const campaign = { startDate: "2026-10-01", endDate: "2026-11-30", period: "Selesai 30 Nov 2026" };
  assert.equal(formatTaskDeadline({ due: "19 Agu" }, campaign), "19 Agustus 2026");
  assert.equal(formatTaskDeadline({ due: "12 Agu", dueDate: "2026-10-31" }, campaign), "31 Oktober 2026");
  assert.equal(formatTaskDeadline({ due: "12 Agu 2025" }, campaign), "12 Agustus 2025");
  assert.equal(formatTaskDeadline({ due: "12 Agu" }), "12 Agustus");
  const crossYear = { startDate: "2026-12-01", endDate: "2027-01-31", period: "Desember 2026 — Januari 2027" };
  assert.equal(formatTaskDeadline({ due: "12 Jan" }, crossYear), "12 Januari 2027");
  assert.equal(formatTaskDeadline({ due: "12 Des" }, crossYear), "12 Desember 2026");
});

test("campaign, phase and legacy ranges use the same date format without guessing missing dates", () => {
  assert.equal(formatCampaignPeriod(null, "2026-11-30"), "Selesai 30 November 2026");
  assert.equal(campaignPeriodLabel({ startDate: "2026-08-01", endDate: "2026-08-31", period: "old text" }), "1 Agustus 2026 — 31 Agustus 2026");
  assert.equal(formatDisplayDateRange("01 Agu — 31 Agu 2026"), "1 Agustus 2026 — 31 Agustus 2026");
  assert.equal(formatDisplayDateRange("01 Des — 31 Jan 2027"), "1 Desember 2026 — 31 Januari 2027");
  assert.equal(formatDisplayDateRange("1–11 September"), "1 September — 11 September");
  assert.equal(phasePeriodLabel({ id: "phase", name: "Peluncuran", startDate: "2026-10-16", endDate: "2026-10-26", purpose: "", period: "", status: "Rencana" }), "16 Oktober 2026 — 26 Oktober 2026");
});
