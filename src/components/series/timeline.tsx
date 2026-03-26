'use client';
import { useState } from 'react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

type MilestoneType = 'decision' | 'blocker' | 'blocker_resolved' | 'info';

interface Meeting {
  id: string;
  title: string;
  started_at: string | null;
  status: string;
}

interface Milestone {
  id: string;
  meeting_id: string;
  milestone_text: string;
  milestone_type: MilestoneType;
  session_number: number;
}

interface Series {
  id: string;
  name: string;
  colour_hex: string;
  started_at: string;
  session_count: number;
  meetings: Meeting[];
  series_milestones: Milestone[];
}

interface SeriesTimelineProps {
  series: Series[];
}

const milestoneColours: Record<MilestoneType, string> = {
  decision: 'bg-blue-500',
  blocker: 'bg-red-500',
  blocker_resolved: 'bg-green-500',
  info: 'bg-slate-400',
};

const milestoneLabels: Record<MilestoneType, string> = {
  decision: 'Decision',
  blocker: 'Blocker',
  blocker_resolved: 'Resolved',
  info: 'Info',
};

type ZoomLevel = '3m' | '6m' | '12m' | 'all';

export function SeriesTimeline({ series }: SeriesTimelineProps) {
  const [zoom, setZoom] = useState<ZoomLevel>('6m');
  const [expandedSeries, setExpandedSeries] = useState<string | null>(null);

  const zoomMonths: Record<ZoomLevel, number> = { '3m': 3, '6m': 6, '12m': 12, 'all': 999 };

  const filterByZoom = (meetings: Meeting[]) => {
    const months = zoomMonths[zoom];
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    return meetings.filter(m => m.started_at && new Date(m.started_at) >= cutoff);
  };

  return (
    <div className="space-y-8">
      {/* Zoom controls */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500 font-medium">Zoom:</span>
        {(['3m', '6m', '12m', 'all'] as ZoomLevel[]).map(z => (
          <button
            key={z}
            onClick={() => setZoom(z)}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
              zoom === z
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
            )}
          >
            {z === 'all' ? 'All time' : z}
          </button>
        ))}
      </div>

      {series.map(s => {
        const visibleMeetings = filterByZoom(s.meetings || []).sort(
          (a, b) => new Date(a.started_at || 0).getTime() - new Date(b.started_at || 0).getTime()
        );
        const isExpanded = expandedSeries === s.id;

        return (
          <div key={s.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Series header */}
            <div
              className="flex items-center justify-between p-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50"
              onClick={() => setExpandedSeries(isExpanded ? null : s.id)}
            >
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.colour_hex }} />
                <h3 className="font-semibold text-slate-900">{s.name}</h3>
                <span className="text-sm text-slate-500">{s.session_count} sessions</span>
              </div>
              <div className="text-sm text-slate-400">
                Started {formatDate(s.started_at)}
              </div>
            </div>

            {/* Timeline track */}
            <div className="p-6 overflow-x-auto">
              {visibleMeetings.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">No meetings in this period</p>
              ) : (
                <div className="relative min-w-[600px]">
                  {/* Horizontal line */}
                  <div className="absolute top-4 left-0 right-0 h-0.5 bg-slate-200" />

                  {/* Meeting dots */}
                  <div className="flex justify-between items-start relative">
                    {visibleMeetings.map((meeting, idx) => {
                      const milestone = s.series_milestones?.find(m => m.meeting_id === meeting.id);
                      const isCurrentMeeting = meeting.status === 'in_progress';
                      const isFuture = meeting.status === 'scheduled';
                      const dotColour = milestone
                        ? milestoneColours[milestone.milestone_type]
                        : isFuture ? 'bg-slate-300' : 'bg-blue-500';

                      return (
                        <div key={meeting.id} className="flex flex-col items-center gap-2" style={{ minWidth: '80px' }}>
                          <Link href={meeting.status === 'completed' ? `/meeting/${meeting.id}/summary` : `/meeting/${meeting.id}/live`}>
                            <div className={cn(
                              'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold z-10 relative cursor-pointer transition-transform hover:scale-110',
                              dotColour,
                              isCurrentMeeting && 'current-meeting-dot ring-4 ring-blue-200',
                              isFuture && 'border-2 border-dashed border-slate-300 bg-white text-slate-400'
                            )}>
                              {idx + 1}
                            </div>
                          </Link>
                          <div className="text-center">
                            <p className="text-xs text-slate-500 whitespace-nowrap">
                              {meeting.started_at ? formatDate(meeting.started_at) : 'Scheduled'}
                            </p>
                            {milestone && (
                              <>
                                <span className={cn(
                                  'inline-block text-xs px-1.5 py-0.5 rounded font-medium mt-1',
                                  milestone.milestone_type === 'decision' ? 'bg-blue-100 text-blue-700' :
                                  milestone.milestone_type === 'blocker' ? 'bg-red-100 text-red-700' :
                                  milestone.milestone_type === 'blocker_resolved' ? 'bg-green-100 text-green-700' :
                                  'bg-slate-100 text-slate-600'
                                )}>
                                  {milestoneLabels[milestone.milestone_type]}
                                </span>
                                <p className="text-xs text-slate-600 mt-1 max-w-[80px] text-center leading-tight">
                                  {milestone.milestone_text}
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Expanded session cards */}
            {isExpanded && (
              <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">All Sessions</h4>
                {(s.meetings || [])
                  .sort((a, b) => new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime())
                  .map((meeting, idx) => {
                    const milestone = s.series_milestones?.find(m => m.meeting_id === meeting.id);
                    return (
                      <Link
                        key={meeting.id}
                        href={meeting.status === 'completed' ? `/meeting/${meeting.id}/summary` : `/meeting/${meeting.id}/live`}
                        className="flex items-start gap-3 bg-white rounded-lg p-3 border border-slate-200 hover:border-blue-200 hover:shadow-sm transition-all"
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ backgroundColor: s.colour_hex }}
                        >
                          {s.meetings.length - idx}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">{meeting.title}</p>
                          {meeting.started_at && (
                            <p className="text-xs text-slate-500">{formatDate(meeting.started_at)}</p>
                          )}
                          {milestone && (
                            <p className="text-xs text-slate-600 mt-1 italic">&ldquo;{milestone.milestone_text}&rdquo;</p>
                          )}
                        </div>
                        {milestone && (
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
                            milestone.milestone_type === 'decision' ? 'bg-blue-100 text-blue-700' :
                            milestone.milestone_type === 'blocker' ? 'bg-red-100 text-red-700' :
                            milestone.milestone_type === 'blocker_resolved' ? 'bg-green-100 text-green-700' :
                            'bg-slate-100 text-slate-600'
                          )}>
                            {milestoneLabels[milestone.milestone_type]}
                          </span>
                        )}
                      </Link>
                    );
                  })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
