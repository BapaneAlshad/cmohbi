"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import type { Brand, Campaign, EntityId, Task } from "@/lib/types";
import { calendarDay, campaignExecutionProgress, validThemeColor } from "@/lib/campaign-timeline";
import { campaignDateSpan, campaignTimelineBounds, campaignTimelineCalendar, campaignTimelinePlacement, campaignTimelineTextColor, timelineDateKey } from "@/lib/campaign-list-timeline";
import { campaignPeriodLabel } from "@/lib/campaign-form";
import { formatDisplayDate } from "@/lib/date-format";
import { CampaignAvatar } from "./campaign-primitives";
import { Icon } from "../ui";
import { useCampaignReveal } from "./use-campaign-animation";

const fallbackColors = ["#4F7FDB", "#2F9D78", "#8C68C4", "#D99634", "#2A9BA4", "#C46C93"];
function brandColor(brand: Brand | undefined, name: string) {
  if (validThemeColor(brand?.primaryColor)) return brand.primaryColor;
  const hash = Array.from(String(brand?.id ?? name)).reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 0);
  return fallbackColors[hash % fallbackColors.length];
}

function CampaignTimelineBar({ campaign, placement, color, title, onOpen }: {
  campaign: Campaign; placement: NonNullable<ReturnType<typeof campaignTimelinePlacement>>; color: string; title: string; onOpen: (id: EntityId) => void;
}) {
  const { ref, revealed } = useCampaignReveal<HTMLButtonElement>();
  return <button ref={ref} type="button" className={`campaign-gantt-bar${placement.kind !== "range" ? " milestone" : ""}`} data-revealed={revealed} onClick={() => onOpen(campaign.id)} title={title} aria-label={`Buka workspace ${title}`} style={{ left: `${placement.left}%`, ...(placement.kind === "range" ? { width: `${placement.width}%` } : {}), "--gantt-color": color, "--gantt-text": campaignTimelineTextColor(color) } as CSSProperties}>
    <span>{campaign.brand} | {campaign.name}</span>{placement.kind !== "range" && <small>{placement.kind === "start" ? "Mulai" : "Selesai"} {formatDisplayDate(campaign.startDate || campaign.endDate)}</small>}
  </button>;
}

export function CampaignListTimeline({ campaigns, brands, tasks, today, onOpen }: {
  campaigns: Campaign[]; brands: Brand[]; tasks: Task[]; today: string; onOpen: (id: EntityId) => void;
}) {
  const [scale, setScale] = useState<"week" | "month">("month");
  const [includeToday, setIncludeToday] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLSpanElement>(null);
  const bounds = useMemo(() => campaignTimelineBounds(campaigns, today, includeToday), [campaigns, today, includeToday]);
  const { months, weeks } = useMemo(() => campaignTimelineCalendar(bounds), [bounds]);
  const sorted = useMemo(() => [...campaigns].sort((a, b) => {
    const aDate = campaignDateSpan(a)?.start, bDate = campaignDateSpan(b)?.start;
    return aDate === undefined ? bDate === undefined ? 0 : 1 : bDate === undefined ? -1 : aDate - bDate;
  }), [campaigns]);
  const chartWidth = Math.max(840, bounds.days * (scale === "week" ? 28 : 6));
  const todayPosition = (calendarDay(today)! - bounds.start + .5) / bounds.days * 100;
  const hasToday = todayPosition >= 0 && todayPosition <= 100;
  const chartStyle = { width: chartWidth, "--gantt-day-width": `${chartWidth / bounds.days}px` } as CSSProperties;
  const focusToday = () => {
    setIncludeToday(true);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const scroll = scrollRef.current, marker = todayRef.current;
      if (!scroll || !marker) return;
      const gutterWidth = scroll.querySelector(".campaign-gantt-corner")!.getBoundingClientRect().width;
      const position = scroll.scrollLeft + marker.getBoundingClientRect().left - scroll.getBoundingClientRect().left;
      scroll.scrollTo({ left: position - gutterWidth - (scroll.clientWidth - gutterWidth) / 2, behavior: "smooth" });
    }));
  };
  const shift = (direction: number) => {
    const scroll = scrollRef.current;
    if (scroll) scroll.scrollBy({ left: direction * Math.max(240, scroll.clientWidth * .7), behavior: "smooth" });
  };

  return <section className={`card campaign-gantt${scale === "week" ? " weekly" : ""}`} aria-label="Timeline semua campaign">
    <div className="campaign-gantt-toolbar">
      <div><h2><Icon name="calendar" size={16} />Timeline campaign</h2><p>{formatDisplayDate(timelineDateKey(bounds.start))} — {formatDisplayDate(timelineDateKey(bounds.end))}</p></div>
      <div className="campaign-gantt-controls">
        <div className="campaign-view-toggle" role="group" aria-label="Skala timeline"><button type="button" aria-pressed={scale === "week"} onClick={() => setScale("week")}>Mingguan</button><button type="button" aria-pressed={scale === "month"} onClick={() => setScale("month")}>Bulanan</button></div>
        <button type="button" className="button button-soft button-sm" onClick={focusToday}>Hari ini</button>
        <div className="campaign-gantt-arrows"><button type="button" className="icon-button" onClick={() => shift(-1)} aria-label="Geser timeline ke kiri"><Icon name="chevron-left" size={16} /></button><button type="button" className="icon-button" onClick={() => shift(1)} aria-label="Geser timeline ke kanan"><Icon name="chevron-right" size={16} /></button></div>
      </div>
    </div>
    <div ref={scrollRef} className="campaign-gantt-scroll" role="region" tabIndex={0} aria-label="Timeline campaign, geser horizontal untuk melihat periode lain">
      <div className="campaign-gantt-canvas" style={{ width: `calc(var(--gantt-label-width) + ${chartWidth}px)` }}>
        <div className="campaign-gantt-header">
          <div className="campaign-gantt-corner"><strong>Campaign</strong><span>Brand · progres tugas</span></div>
          <div className="campaign-gantt-calendar" style={chartStyle}>
            <div className="campaign-gantt-months">{months.map((month) => <span key={month.key} title={month.label} style={{ left: `${month.offset / bounds.days * 100}%`, width: `${month.days / bounds.days * 100}%` }}>{month.days / bounds.days * chartWidth >= 90 ? month.label : ""}</span>)}</div>
            <div className="campaign-gantt-weeks">{weeks.map((week) => <span key={week.day} style={{ left: `${week.offset / bounds.days * 100}%`, width: `${week.days / bounds.days * 100}%` }} title={`Minggu ${week.number}: ${formatDisplayDate(timelineDateKey(week.day))} — ${formatDisplayDate(timelineDateKey(week.day + week.days - 1))}`}>M{week.number}</span>)}</div>
            {scale === "week" && <div className="campaign-gantt-days">{Array.from({ length: bounds.days }, (_, index) => <span key={bounds.start + index} className={index % 7 >= 5 ? "weekend" : undefined} style={{ left: `${index / bounds.days * 100}%`, width: `${100 / bounds.days}%` }} title={formatDisplayDate(timelineDateKey(bounds.start + index))}>{Number(timelineDateKey(bounds.start + index).slice(8))}</span>)}</div>}
            {hasToday && <span ref={todayRef} className="campaign-gantt-today-label" style={{ left: `${todayPosition}%` }}>Saat ini</span>}
          </div>
        </div>
        {sorted.map((campaign) => {
          const brand = brands.find((item) => campaign.brandId != null && String(item.id) === String(campaign.brandId)) || brands.find((item) => item.name === campaign.brand);
          const color = brandColor(brand, campaign.brand), placement = campaignTimelinePlacement(campaign, bounds);
          const stats = campaignExecutionProgress(campaign, tasks);
          const period = campaignPeriodLabel(campaign);
          const title = `${campaign.brand} | ${campaign.name} · ${period} · ${stats.percentage === null ? "Belum ada tugas" : `${stats.percentage}% tugas selesai`}`;
          return <div className="campaign-gantt-row" key={campaign.id}>
            <button type="button" className="campaign-gantt-identity" onClick={() => onOpen(campaign.id)} title={title}>
              <CampaignAvatar src={campaign.avatarUrl} fallbackSrc={brand?.logoUrl} initials={campaign.brand.slice(0, 2).toUpperCase()} />
              <span><strong>{campaign.name}</strong><small><i style={{ background: color }} />{campaign.brand}<b>·</b>{stats.percentage === null ? "—" : `${stats.percentage}%`}</small></span>
            </button>
            <div className="campaign-gantt-lane" style={chartStyle}>
              {weeks.map((week) => <span key={week.day} className="campaign-gantt-week-boundary" style={{ left: `${week.offset / bounds.days * 100}%` }} aria-hidden="true" />)}
              {hasToday && <span className="campaign-gantt-today-line" style={{ left: `${todayPosition}%` }} aria-hidden="true" />}
              {placement ? <CampaignTimelineBar campaign={campaign} placement={placement} color={color} title={title} onOpen={onOpen} /> : <button type="button" className="campaign-gantt-undated" onClick={() => onOpen(campaign.id)}><Icon name="calendar" size={13} />{campaign.startDate || campaign.endDate ? "Periode perlu dilengkapi" : "Periode belum ditentukan"}<Icon name="arrow-right" size={12} /></button>}
            </div>
          </div>;
        })}
      </div>
    </div>
    <div className="campaign-gantt-footer"><span><i />Setiap bar menunjukkan periode satu campaign.</span><span>Klik campaign untuk membuka workspace.</span></div>
  </section>;
}
