import test from "node:test";
import assert from "node:assert/strict";
import { campaignDateSpan, campaignTimelineBounds, campaignTimelineCalendar, campaignTimelinePlacement } from "../lib/campaign-list-timeline.ts";
import { calendarDay } from "../lib/campaign-timeline.ts";

test("campaign bars use inclusive campaign periods, including overlapping and one-day campaigns", () => {
  const a = { startDate: "2026-10-01", endDate: "2026-10-31" };
  const b = { startDate: "2026-10-15", endDate: "2026-10-15" };
  const bounds = campaignTimelineBounds([a, b], "2026-11-03");
  assert.equal(campaignDateSpan(a)!.end - campaignDateSpan(a)!.start + 1, 31);
  assert.equal(campaignTimelinePlacement(a, bounds)!.width, 31 / bounds.days * 100);
  assert.equal(campaignTimelinePlacement(b, bounds)!.width, 1 / bounds.days * 100);
  assert.ok(campaignTimelinePlacement(b, bounds)!.left > campaignTimelinePlacement(a, bounds)!.left);
});

test("missing and partial dates do not invent campaign duration or use phase dates", () => {
  assert.equal(campaignDateSpan({}), null);
  assert.equal(campaignDateSpan({ startDate: "2026-02-30" }), null);
  assert.equal(campaignDateSpan({ startDate: "2026-10-31", endDate: "2026-10-01" }), null);
  assert.equal(campaignDateSpan({ startDate: "2026-10-01" })?.kind, "start");
  assert.equal(campaignDateSpan({ endDate: "2026-10-31" })?.kind, "end");
  assert.equal(campaignDateSpan({ timelineConfig: { phases: [{ startDate: "2026-10-01" }] } } as object), null);
});

test("timeline grid aligns Mondays, spans years, and can include today outside historical campaigns", () => {
  const campaigns = [{ startDate: "2026-12-30", endDate: "2027-01-05" }];
  const bounds = campaignTimelineBounds(campaigns, "2027-06-01");
  const grid = campaignTimelineCalendar(bounds);
  assert.equal(new Date(bounds.start * 86_400_000).getUTCDay(), 1);
  assert.equal(grid.months.reduce((sum, month) => sum + month.days, 0), bounds.days);
  assert.ok(grid.months.some((month) => month.key === "2027-01"));
  assert.equal(grid.weeks.find((week) => week.day === calendarDay("2026-12-29"))?.number, 5);
  assert.equal(grid.weeks.find((week) => week.day === calendarDay("2027-01-01"))?.number, 1);
  assert.equal(grid.weeks.reduce((sum, week) => sum + week.days, 0), bounds.days);
  assert.ok(campaignTimelineBounds(campaigns, "2027-06-01", true).end >= calendarDay("2027-06-01")!);
  const empty = campaignTimelineBounds([{}], "2027-06-01");
  assert.ok(empty.start <= calendarDay("2027-06-01")! && empty.end >= calendarDay("2027-06-01")!);
});

test("month-local weeks reset on the first and stop at month boundaries, including leap February", () => {
  for (const [start, end, lengths] of [
    ["2026-06-22", "2026-07-31", [7, 2, 7, 7, 7, 7, 3]],
    ["2028-02-01", "2028-03-07", [7, 7, 7, 7, 1, 7]],
    ["2027-02-01", "2027-03-07", [7, 7, 7, 7, 7]],
  ] as const) {
    const first = calendarDay(start)!, last = calendarDay(end)!;
    const grid = campaignTimelineCalendar({ start: first, end: last, days: last - first + 1 });
    assert.deepEqual(grid.weeks.map((week) => week.days), [...lengths]);
    for (const week of grid.weeks) {
      const date = new Date(week.day * 86_400_000);
      const endDate = new Date((week.day + week.days - 1) * 86_400_000);
      assert.equal(week.number, Math.ceil(date.getUTCDate() / 7));
      assert.equal(date.getUTCMonth(), endDate.getUTCMonth());
      if (date.getUTCDate() === 1) assert.equal(week.number, 1);
    }
  }
});
