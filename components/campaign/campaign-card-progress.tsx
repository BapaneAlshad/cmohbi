import type { CSSProperties } from "react";
import type { Campaign, Task } from "@/lib/types";
import { campaignExecutionProgress, datedPhase, phasePeriodLabel, timelineMarker } from "@/lib/campaign-timeline";

export function CampaignCardProgress({ campaign, tasks, today, onSetDates }: { campaign: Campaign; tasks: Task[]; today: string; onSetDates?: () => void }) {
  const stats = campaignExecutionProgress(campaign, tasks);
  const phased = campaign.timelineConfig?.phaseMode && stats.phases.length > 0;
  const marker = phased ? timelineMarker(stats.phases, today) : null;
  const needsDates = phased && stats.phases.some((phase) => !datedPhase(phase));
  const tone = (stats.percentage || 0) < 40 ? "low" : (stats.percentage || 0) < 80 ? "medium" : "high";
  return <div className={`campaign-progress-block ${stats.total || phased ? "" : "empty"} ${phased ? "phased" : ""}`} data-tone={tone}>
    <div className="campaign-progress-heading"><strong>{stats.total} tugas</strong><strong aria-label="Persentase tugas selesai">{stats.percentage === null ? "—" : `${stats.percentage}%`}</strong></div>
    {phased ? <>
      <div className="phase-timeline-scroll" tabIndex={0} role="region" aria-label={`Progres fase ${campaign.name}`}>
        <div className="phase-timeline" style={{ "--phase-count": stats.phases.length } as CSSProperties}>
          {marker && <div className={`phase-today-marker${marker.position <= 8 ? " edge-start" : marker.position >= 92 ? " edge-end" : ""}`} style={{ left: `${marker.position}%` }} aria-label={`${marker.label}, penanda tanggal hari ini`}><span>{marker.label}</span><i aria-hidden="true" /></div>}
          <div className="phase-segments">{stats.phases.map((phase, index) => <div key={phase.id} className="phase-segment" style={{ "--phase-color": phase.color } as CSSProperties}>
            <div className="phase-segment-track" role="progressbar" aria-label={`Fase ${phase.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase.percentage === null ? undefined : Math.round(phase.percentage)} aria-valuetext={phase.total ? `${phase.completed} dari ${phase.total} tugas selesai` : "Belum ada tugas"}><span style={{ width: `${phase.percentage || 0}%` }} /></div>
            <i className="phase-boundary start" aria-hidden="true" />{index === stats.phases.length - 1 && <i className="phase-boundary end" aria-hidden="true" />}
          </div>)}</div>
          <div className="phase-segment-labels">{stats.phases.map((phase) => <div key={phase.id} className={marker?.phaseId === phase.id ? "current" : ""} title={phasePeriodLabel(phase)}><strong><span className="phase-label-name" title={phase.name}>{phase.name}</span><span className="phase-task-count">({phase.completed}/{phase.total})</span></strong></div>)}</div>
        </div>
      </div>
      {needsDates && onSetDates && <div className="phase-date-prompt"><button type="button" className="link-button" onClick={onSetDates}>Atur tanggal fase →</button></div>}
    </> : <div className="progress-track" role="progressbar" aria-label={`Progres ${campaign.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.percentage ?? undefined} aria-valuetext={stats.total ? `${stats.completed} dari ${stats.total} tugas selesai` : "Belum ada tugas"}><span style={{ width: `${stats.percentage || 0}%` }} /></div>}
  </div>;
}
