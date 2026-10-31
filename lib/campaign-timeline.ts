import type { Campaign, CampaignTimelinePhase, Task } from "./types.ts";
import { formatDisplayDate, formatDisplayDateRange } from "./date-format.ts";

const DAY = 86_400_000;
const colors = ["#2F9D78", "#4F7FDB", "#D99634", "#8C68C4", "#2A9BA4", "#C46C93", "#638B39", "#5967BD"];
export const validThemeColor = (color?: string | null): color is string => Boolean(color && /^#[0-9a-fA-F]{6}$/.test(color));
export const phaseColor = (phase: CampaignTimelinePhase, index: number) => validThemeColor(phase.color) ? phase.color : colors[index % colors.length];

export function calendarDay(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date.getTime() / DAY : null;
}
export const datedPhase = (phase: CampaignTimelinePhase) => calendarDay(phase.startDate) !== null && calendarDay(phase.endDate) !== null && phase.startDate! <= phase.endDate!;
export function jakartaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)!.value).join("-");
}
export function orderedPhases(phases: CampaignTimelinePhase[]) {
  const colored = phases.map((phase, index) => ({ ...phase, color: phaseColor(phase, index) }));
  return colored.every(datedPhase) ? colored.sort((a, b) => a.startDate!.localeCompare(b.startDate!)) : colored;
}
export function validateTimeline(phases: CampaignTimelinePhase[], campaign: Pick<Campaign, "startDate" | "endDate">, allowLegacy = true) {
  const ids = new Set<string>();
  for (const phase of phases) {
    if (!phase.id || ids.has(phase.id)) return "ID fase tidak valid atau duplikat.";
    ids.add(phase.id);
    if (!phase.name.trim()) return "Nama fase wajib diisi.";
    if (phase.color && !validThemeColor(phase.color)) return "Warna fase harus berupa kode HEX enam digit.";
    if (!phase.startDate && !phase.endDate && allowLegacy) continue;
    if (!datedPhase(phase)) return `Tanggal fase “${phase.name}” tidak valid. Tanggal selesai tidak boleh sebelum tanggal mulai.`;
    if ((campaign.startDate && phase.startDate! < campaign.startDate) || (campaign.endDate && phase.endDate! > campaign.endDate)) return `Tanggal fase “${phase.name}” harus berada dalam periode Campaign.`;
  }
  const dated = phases.filter(datedPhase).sort((a, b) => a.startDate!.localeCompare(b.startDate!));
  for (let i = 1; i < dated.length; i++) if (dated[i].startDate! <= dated[i - 1].endDate!) return `Tanggal fase “${dated[i].name}” bertumpang tindih dengan fase sebelumnya.`;
  return null;
}
export function phaseTimeState(phase: CampaignTimelinePhase, today: string) {
  if (!datedPhase(phase)) return "Tanggal belum diatur";
  if (today < phase.startDate!) return "Belum dimulai";
  if (today > phase.endDate!) return "Periode berakhir";
  return "Sedang berlangsung";
}
export function phasePeriodLabel(phase: CampaignTimelinePhase) {
  if (!datedPhase(phase)) return formatDisplayDateRange(phase.period || "Tanggal belum diatur");
  return `${formatDisplayDate(phase.startDate)} — ${formatDisplayDate(phase.endDate)}`;
}
export function timelineMarker(phases: CampaignTimelinePhase[], today: string) {
  const ordered = orderedPhases(phases);
  const day = calendarDay(today);
  if (!ordered.length || !ordered.every(datedPhase) || day === null) return null;
  const phaseCenter = (index: number) => (index + .5) / ordered.length * 100;
  if (today < ordered[0].startDate!) return { position: phaseCenter(0), label: "Belum dimulai", phaseId: undefined };
  // The marker represents the current date on the campaign card. Keep the
  // phase detail state available separately, but use a plain label here so
  // an active campaign is not visually read as closed just because its last
  // configured phase has already ended.
  if (today > ordered[ordered.length - 1].endDate!) return { position: phaseCenter(ordered.length - 1), label: "Saat ini", phaseId: undefined };
  for (let i = 0; i < ordered.length; i++) {
    const phase = ordered[i], start = calendarDay(phase.startDate)!, end = calendarDay(phase.endDate)!;
    if (day >= start && day <= end) return { position: phaseCenter(i), label: "Saat ini", phaseId: phase.id };
    if (day < start) return { position: i / ordered.length * 100, label: "Jeda antar fase", phaseId: undefined };
  }
  return null;
}
export function defaultTimelinePhase(phases: CampaignTimelinePhase[], today: string) {
  const ordered = orderedPhases(phases), marker = timelineMarker(ordered, today);
  return ordered.find((phase) => phase.id === marker?.phaseId) || ordered.find((phase) => datedPhase(phase) && phase.startDate! > today) || ordered[ordered.length - 1];
}
export function campaignExecutionProgress(campaign: Campaign, tasks: Task[]) {
  const eligible = tasks.filter((task) => String(task.campaign) === String(campaign.id) && task.status !== "Backlog");
  const completed = eligible.filter((task) => task.status === "Done").length;
  const phases = orderedPhases(campaign.timelineConfig?.phases || []);
  const assignments = campaign.timelineConfig?.taskPhase || {};
  return {
    total: eligible.length, completed, percentage: eligible.length ? Math.round(completed / eligible.length * 100) : null,
    unassigned: eligible.filter((task) => !phases.some((phase) => phase.id === assignments[String(task.id)])).length,
    phases: phases.map((phase) => {
      const phaseTasks = eligible.filter((task) => assignments[String(task.id)] === phase.id), done = phaseTasks.filter((task) => task.status === "Done").length;
      return { ...phase, total: phaseTasks.length, completed: done, percentage: phaseTasks.length ? done / phaseTasks.length * 100 : null };
    }),
  };
}
