import test from "node:test";
import assert from "node:assert/strict";
import { calendarDay, campaignExecutionProgress, defaultTimelinePhase, jakartaDateKey, orderedPhases, phaseTimeState, timelineMarker, validateTimeline, validThemeColor } from "../lib/campaign-timeline.ts";
import type { Campaign, CampaignTimelinePhase, Task } from "../lib/types.ts";

const phase = (id: string, startDate?: string, endDate = startDate): CampaignTimelinePhase => ({ id, name: id, startDate, endDate, period: "periode lama", purpose: "" });
const phases = [phase("a", "2026-10-01", "2026-10-03"), phase("b", "2026-10-06", "2026-10-06"), phase("c", "2026-10-08", "2026-10-10")];
const campaign = { id: "campaign", startDate: "2026-10-01", endDate: "2026-10-31", timelineConfig: { phaseMode: true, phases, taskPhase: { a1: "a", a2: "a", b1: "b", backlog: "a", pending: "a" } } } as unknown as Campaign;
const task = (id: string, status: Task["status"]): Task => ({ id, status, campaign: "campaign" } as Task);

test("phase progress is independent, ignores Backlog and pending targets, includes unassigned in overall total", () => {
  const tasks = [task("a1", "Done"), task("a2", "To Do"), task("b1", "Done"), task("backlog", "Backlog"), { ...task("pending", "Review"), pendingStatusRequest: { toStatus: "Done" } }, task("unassigned", "Done"), { ...task("other", "Done"), campaign: "other" }] as Task[];
  const result = campaignExecutionProgress(campaign, tasks);
  assert.equal(result.total, 5); assert.equal(result.completed, 3); assert.equal(result.percentage, 60); assert.equal(result.unassigned, 1);
  assert.ok(Math.abs(result.phases[0].percentage! - 100 / 3) < 1e-10); assert.equal(result.phases[1].percentage, 100); assert.equal(result.phases[2].percentage, null);
  assert.equal(campaignExecutionProgress(campaign, []).percentage, null);
});

test("WIB day changes at 17:00 UTC regardless of computer timezone", () => {
  assert.equal(jakartaDateKey(new Date("2026-10-28T16:59:59Z")), "2026-10-28");
  assert.equal(jakartaDateKey(new Date("2026-10-28T17:00:00Z")), "2026-10-29");
  assert.equal(calendarDay("2026-02-30"), null); assert.equal(calendarDay("0000-01-01"), null);
});

test("time markers stay centered within the active phase, including start/end dates and one-day phases", () => {
  const start = timelineMarker(phases, "2026-10-01")!, end = timelineMarker(phases, "2026-10-03")!;
  assert.equal(start.position, .5 / 3 * 100); assert.equal(end.position, start.position);
  assert.equal(timelineMarker(phases, "2026-10-02")?.position, start.position);
  assert.deepEqual(timelineMarker(phases, "2026-10-06"), { position: 50, label: "Saat ini", phaseId: "b" });
  assert.ok(Math.abs(timelineMarker(phases, "2026-10-05")!.position - 100 / 3) < 1e-10);
  assert.equal(timelineMarker(phases, "2026-10-05")!.label, "Jeda antar fase");
  assert.equal(timelineMarker(phases, "2026-09-30")?.position, .5 / 3 * 100); assert.equal(timelineMarker(phases, "2026-10-11")?.position, 2.5 / 3 * 100);
  assert.equal(timelineMarker(phases, "2026-10-11")?.label, "Saat ini");
  assert.equal(phaseTimeState(phases[0], "2026-10-03"), "Sedang berlangsung"); assert.equal(phaseTimeState(phases[0], "2026-10-04"), "Periode berakhir");
  assert.equal(defaultTimelinePhase(phases, "2026-10-06")?.id, "b");
});

test("date validation rejects reversed, partial, overlapping and out-of-bounds phases; permits gaps and blank campaign period", () => {
  assert.equal(validateTimeline(phases, campaign), null);
  assert.equal(validateTimeline(phases, {}), null);
  for (const invalid of [[phase("a", "2026-10-05", "2026-10-01")], [phase("a", "2026-10-32")], [phase("a", "2026-09-30")], [phase("a", "2026-11-01")], [phases[0], phase("b", "2026-10-03")], [phase("a", "2026-10-01", "")]]) assert.ok(validateTimeline(invalid, campaign));
  assert.ok(validateTimeline(phases, { endDate: "2026-10-09" }));
  assert.ok(validateTimeline([{ ...phases[0], color: "red" }], campaign));
  assert.equal(validThemeColor("#0011Aa"), true); assert.equal(validThemeColor("#abc"), false);
});

test("legacy phases retain text without guessing dates, and persisted colors/IDs survive date reordering", () => {
  const legacy = phase("old");
  assert.equal(validateTimeline([legacy], campaign), null); assert.ok(validateTimeline([legacy], campaign, false));
  assert.equal(timelineMarker([legacy], "2026-10-02"), null); assert.equal(phaseTimeState(legacy, "2026-10-02"), "Tanggal belum diatur");
  const colored = orderedPhases(phases), changed = orderedPhases(colored.map((item) => item.id === "a" ? { ...item, startDate: "2026-10-15", endDate: "2026-10-16" } : item));
  assert.equal(changed.at(-1)?.id, "a"); assert.equal(changed.at(-1)?.color, colored[0].color); assert.equal(orderedPhases([legacy])[0].period, "periode lama");
});

test("many phases keep equal time segments and stable valid palette colors", () => {
  const many = orderedPhases(Array.from({ length: 12 }, (_, index) => phase(`p${index}`, `2026-10-${String(index + 1).padStart(2, "0")}`)));
  assert.equal(validateTimeline(many, campaign), null);
  assert.equal(many.every((item) => validThemeColor(item.color)), true);
  assert.equal(timelineMarker(many, "2026-10-07")?.position, 6.5 / 12 * 100);
});
