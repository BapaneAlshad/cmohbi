import type { Campaign, Task } from "./types.ts";

const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const monthIndex = new Map(months.flatMap((name, index) => [[name.toLowerCase(), index + 1], [name.slice(0, 3).toLowerCase(), index + 1]] as [string, number][]));
monthIndex.set("agt", 8);
monthIndex.set("sept", 9);
const dateOptions = { day: "numeric", month: "long", year: "numeric" } as const;
type FormatOptions = { referenceYear?: number; now?: Date; empty?: string };

function calendarDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || year < 100 || year > 9999) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

function timestamp(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:\d{2})?$/i);
  if (!match || !calendarDate(Number(match[1]), Number(match[2]), Number(match[3]))) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}${match[5] || "+07:00"}`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function jakartaCalendarDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Jakarta" }).formatToParts(now);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  return calendarDate(part("year"), part("month"), part("day"))!;
}

/** Format only at the display boundary; ISO values in forms and storage stay unchanged. */
export function formatDisplayDate(value?: string | Date | null, options: FormatOptions = {}): string {
  if (value == null || value === "") return options.empty ?? "—";
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Intl.DateTimeFormat("id-ID", { ...dateOptions, timeZone: "Asia/Jakarta" }).format(value) : options.empty ?? "—";
  const text = value.trim();
  const instant = timestamp(text);
  if (instant) return formatDisplayDate(instant, options);
  if (/^\d{4}-\d{2}-\d{2}[T ]\d/.test(text)) return options.empty ?? "—";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const date = calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return date ? new Intl.DateTimeFormat("id-ID", { ...dateOptions, timeZone: "UTC" }).format(date) : options.empty ?? "—";
  }
  const numeric = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (numeric) {
    const date = calendarDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
    return date ? new Intl.DateTimeFormat("id-ID", { ...dateOptions, timeZone: "UTC" }).format(date) : options.empty ?? "—";
  }
  const relative = ["kemarin", "hari ini", "besok"].indexOf(text.toLowerCase());
  if (relative >= 0) {
    const date = jakartaCalendarDate(options.now || new Date());
    date.setUTCDate(date.getUTCDate() + relative - 1);
    return new Intl.DateTimeFormat("id-ID", { ...dateOptions, timeZone: "UTC" }).format(date);
  }
  const legacy = text.match(/^(\d{1,2})\s+([a-z]+)\.?(?:\s+(\d{4}))?(?:,?\s+\d{1,2}[:.]\d{2}.*)?$/i);
  const month = legacy ? monthIndex.get(legacy[2].toLowerCase()) : undefined;
  if (legacy && month) {
    const year = legacy[3] ? Number(legacy[3]) : options.referenceYear;
    if (year == null) {
      // Preserve missing years rather than silently inventing a historical date.
      return calendarDate(2000, month, Number(legacy[1])) ? `${Number(legacy[1])} ${months[month - 1]}` : options.empty ?? "—";
    }
    const date = calendarDate(year, month, Number(legacy[1]));
    return date ? new Intl.DateTimeFormat("id-ID", { ...dateOptions, timeZone: "UTC" }).format(date) : options.empty ?? "—";
  }
  return text;
}

export function formatDisplayDateTime(value?: string | Date | null, options: FormatOptions = {}): string {
  if (value == null || value === "") return options.empty ?? "—";
  const instant = value instanceof Date ? value : timestamp(value.trim());
  if (instant && Number.isFinite(instant.getTime())) {
    const time = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(instant);
    return `${formatDisplayDate(instant)}, ${time} WIB`;
  }
  if (typeof value !== "string") return options.empty ?? "—";
  const time = value.match(/[,\s]+(\d{1,2})[:.](\d{2})(?:\s*(?:WIB|GMT\+7))?$/i);
  const dateText = time ? value.slice(0, time.index).trim() : value;
  return `${formatDisplayDate(dateText, options)}${time && Number(time[1]) < 24 && Number(time[2]) < 60 ? `, ${time[1].padStart(2, "0")}.${time[2]} WIB` : ""}`;
}

export function formatDisplayDateRange(value: string): string {
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})\s+[—–-]\s+(\d{4}-\d{2}-\d{2})$/);
  if (iso) return `${formatDisplayDate(iso[1])} — ${formatDisplayDate(iso[2])}`;
  const range = value.match(/^(\d{1,2})(?:\s+([a-z]+)\.?(?:\s+(\d{4}))?)?\s*[—–-]\s*(\d{1,2})\s+([a-z]+)\.?(?:\s+(\d{4}))?$/i);
  if (range) {
    const endYear = range[6] ? Number(range[6]) : undefined;
    const startMonth = range[2] || range[5];
    const acrossYear = (monthIndex.get(startMonth.toLowerCase()) || 0) > (monthIndex.get(range[5].toLowerCase()) || 0);
    const startYear = range[3] ? Number(range[3]) : endYear == null ? undefined : endYear - Number(acrossYear);
    return `${formatDisplayDate(`${range[1]} ${startMonth}`, { referenceYear: startYear })} — ${formatDisplayDate(`${range[4]} ${range[5]}`, { referenceYear: endYear ?? startYear })}`;
  }
  const prefix = value.match(/^(Mulai|Selesai)\s+(.+)$/i);
  return prefix ? `${prefix[1]} ${formatDisplayDate(prefix[2])}` : formatDisplayDate(value);
}

export function formatTaskDeadline(task: Pick<Task, "due" | "dueDate">, campaign?: Pick<Campaign, "startDate" | "endDate" | "period">, now?: Date) {
  const value = task.dueDate || task.due;
  const years = Array.from(new Set([campaign?.startDate?.slice(0, 4), campaign?.endDate?.slice(0, 4), ...(campaign?.period?.match(/\b\d{4}\b/g) || [])].filter(Boolean).map(Number)));
  const referenceYear = years.find((year) => {
    const label = formatDisplayDate(value, { referenceYear: year, now });
    const parts = label.match(/^(\d+) ([a-z]+) (\d{4})$/i);
    const month = parts ? monthIndex.get(parts[2].toLowerCase()) : undefined;
    if (!parts || !month) return false;
    const key = `${parts[3]}-${String(month).padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
    return (!campaign?.startDate || key >= campaign.startDate) && (!campaign?.endDate || key <= campaign.endDate);
  }) ?? years[0];
  return formatDisplayDate(value, { referenceYear, now, empty: "Belum dijadwalkan" });
}
