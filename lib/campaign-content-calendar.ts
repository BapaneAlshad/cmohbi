import type { Campaign, InfluencerSchedule, Task } from "./types";

export type CampaignCalendarEvent = {
  id: string;
  date: string;
  type: "feed_carousel" | "reels" | "influencer_upload";
  title: string;
  subtitle: string;
  status: string;
};

function isCalendarDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function campaignCalendarEvents(campaign: Campaign, tasks: Task[], schedules: InfluencerSchedule[]) {
  const taskEvents: CampaignCalendarEvent[] = tasks.flatMap((task) => {
    const type = task.contentCalendarType;
    const date = task.dueDate;
    if (String(task.campaign ?? "") !== String(campaign.id) || (type !== "feed_carousel" && type !== "reels") || !isCalendarDate(date)) return [];
    return [{
      id: `task:${task.id}`,
      date,
      type,
      title: task.title,
      subtitle: type === "feed_carousel" ? "Official · Feed / Carousel" : "Official · Reels",
      status: task.status,
    }];
  });

  const influencerEvents: CampaignCalendarEvent[] = schedules.flatMap((schedule) => {
    const linked = schedule.campaignId != null
      ? String(schedule.campaignId) === String(campaign.id)
      : schedule.campaign === campaign.name;
    if (!linked || !isCalendarDate(schedule.uploadDate)) return [];
    return [{
      id: `influencer:${schedule.id}`,
      date: schedule.uploadDate,
      type: "influencer_upload",
      title: schedule.themeName || schedule.content || schedule.influencer,
      subtitle: `Influencer · ${schedule.influencer}`,
      status: schedule.status,
    }];
  });

  return [...taskEvents, ...influencerEvents].sort((left, right) => left.date.localeCompare(right.date) || left.title.localeCompare(right.title, "id"));
}

export function calendarMonthCells(year: number, monthIndex: number) {
  const firstDay = new Date(year, monthIndex, 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const firstCell = new Date(year, monthIndex, 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCell.getFullYear(), firstCell.getMonth(), firstCell.getDate() + index);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { dateKey, day: date.getDate(), inMonth: date.getMonth() === monthIndex && date.getFullYear() === year };
  });
}

export function calendarMonthTitle(year: number, monthIndex: number) {
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(year, monthIndex, 1));
}
