import type { Campaign } from "./types.ts";
import { calendarDay } from "./campaign-timeline.ts";

const DAY = 86_400_000;
export const timelineDateKey = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
const monday = (day: number) => day - (new Date(day * DAY).getUTCDay() + 6) % 7;

/** Only explicit Campaign dates define its duration; phase dates are unrelated. */
export function campaignDateSpan(campaign: Pick<Campaign, "startDate" | "endDate">) {
  const start = calendarDay(campaign.startDate), end = calendarDay(campaign.endDate);
  if (start !== null && end !== null) return end >= start ? { start, end, kind: "range" as const } : null;
  if (start !== null) return { start, end: start, kind: "start" as const };
  if (end !== null) return { start: end, end, kind: "end" as const };
  return null;
}

export function campaignTimelineBounds(campaigns: Pick<Campaign, "startDate" | "endDate">[], today: string, includeToday = false) {
  const spans = campaigns.map(campaignDateSpan).filter((span) => span !== null);
  const todayDay = calendarDay(today)!;
  const days = spans.flatMap((span) => [span.start, span.end]);
  if (!days.length || includeToday) days.push(todayDay);
  const start = monday(Math.min(...days)) - 7;
  const last = Math.max(...days) + 7;
  const end = monday(Math.max(last, start + 83)) + 6;
  return { start, end, days: end - start + 1 };
}

export function campaignTimelinePlacement(campaign: Pick<Campaign, "startDate" | "endDate">, bounds: { start: number; days: number }) {
  const span = campaignDateSpan(campaign);
  if (!span) return null;
  return {
    kind: span.kind,
    left: (span.start - bounds.start + (span.kind === "range" ? 0 : .5)) / bounds.days * 100,
    width: (span.end - span.start + 1) / bounds.days * 100,
  };
}

export function campaignTimelineCalendar(bounds: { start: number; end: number; days: number }) {
  const months: { key: string; label: string; offset: number; days: number }[] = [];
  const weeks: { day: number; number: number; year: number; offset: number; days: number }[] = [];
  let cursor = bounds.start;
  while (cursor <= bounds.end) {
    const date = new Date(cursor * DAY);
    const monthStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / DAY;
    const nextMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / DAY;
    const end = Math.min(nextMonth, bounds.end + 1);
    months.push({ key: timelineDateKey(cursor).slice(0, 7), label: new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(date), offset: cursor - bounds.start, days: end - cursor });
    // Month-local weeks: 1–7 = M1, 8–14 = M2, with a shorter final week.
    for (let day = cursor; day < end;) {
      const number = Math.floor((day - monthStart) / 7) + 1;
      const weekEnd = Math.min(monthStart + number * 7, end);
      weeks.push({ day, number, year: date.getUTCFullYear(), offset: day - bounds.start, days: weekEnd - day });
      day = weekEnd;
    }
    cursor = end;
  }
  return { months, weeks };
}

export function campaignTimelineTextColor(hex: string) {
  const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2] > .179 ? "#171717" : "#FFFFFF";
}
