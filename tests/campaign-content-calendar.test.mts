import test from "node:test";
import assert from "node:assert/strict";
import type { Campaign, InfluencerSchedule, Task } from "../lib/types.ts";
import { campaignCalendarEvents, calendarMonthCells, calendarMonthTitle } from "../lib/campaign-content-calendar.ts";

const campaign: Campaign = {
  id: "campaign-a", name: "Campaign A", brand: "HBI", objective: "", period: "", status: "Berjalan", progress: 0,
  budget: 0, spent: 0, kpi: "", tasks: 0, content: 0, lifecycleStatus: "active",
};

function makeTask(overrides: Partial<Task> = {}): Task {
  return { id: "task-1", title: "Task konten", brand: "HBI", pic: "Belum ditentukan", due: "2026-10-15", dueDate: "2026-10-15", contentCalendarType: "feed_carousel", priority: "Sedang", status: "To Do", campaign: campaign.id, ...overrides };
}

function makeSchedule(overrides: Partial<InfluencerSchedule> = {}): InfluencerSchedule {
  return { id: "booking-1", influencer: "Nadia", platform: "Instagram", campaign: campaign.name, campaignId: campaign.id, content: "Konten influencer", visitDate: "2026-10-12", uploadDate: "2026-10-15", date: "2026-10-12", time: "10:00", status: "Terjadwal", rate: 0, spent: 0, paymentStatus: "Belum dibayar", ...overrides };
}

test("kalender hanya mengambil deadline konten dari campaign yang dipilih", () => {
  const events = campaignCalendarEvents(campaign, [
    makeTask(),
    makeTask({ id: "task-2", title: "Reels", contentCalendarType: "reels", status: "Done" }),
    makeTask({ id: "task-old", contentCalendarType: undefined }),
    makeTask({ id: "task-no-date", dueDate: undefined }),
    makeTask({ id: "task-other-campaign", campaign: "campaign-b" }),
  ], []);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.type).sort(), ["feed_carousel", "reels"]);
  assert.ok(events.some((event) => event.status === "Done"));
});

test("jadwal influencer memakai tanggal upload, bukan visit atau tanggal legacy", () => {
  const events = campaignCalendarEvents(campaign, [], [
    makeSchedule(),
    makeSchedule({ id: "visit-only", uploadDate: null, date: "2026-10-15" }),
    makeSchedule({ id: "legacy-no-upload", campaignId: undefined, uploadDate: undefined, visitDate: "2026-10-15", date: "2026-10-15" }),
    makeSchedule({ id: "unlinked", campaign: "Tanpa campaign", campaignId: null }),
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].date, "2026-10-15");
  assert.equal(events[0].type, "influencer_upload");
});

test("beberapa event pada tanggal sama dipertahankan dan tanggal tidak di-offset zona waktu", () => {
  const events = campaignCalendarEvents(campaign, [makeTask()], [makeSchedule()]);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.date), ["2026-10-15", "2026-10-15"]);
});

test("tanggal kalender yang tidak valid diabaikan", () => {
  const events = campaignCalendarEvents(campaign, [makeTask({ dueDate: "2026-02-30" })], [makeSchedule({ uploadDate: "2026-13-01" })]);
  assert.deepEqual(events, []);
});

test("month grid dimulai Senin, mencakup 42 hari, dan menangani pergantian tahun", () => {
  const cells = calendarMonthCells(2027, 0);
  assert.equal(cells.length, 42);
  assert.equal(cells[0].dateKey, "2026-12-28");
  assert.equal(cells[0].inMonth, false);
  assert.equal(cells.find((cell) => cell.dateKey === "2027-01-01")?.inMonth, true);
  assert.match(calendarMonthTitle(2027, 0), /Januari 2027/i);
});
