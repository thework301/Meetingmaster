import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Clock,
  Users,
  AlertTriangle,
  CheckCircle2,
  Circle,
  XCircle,
  ChevronDown,
  FileText,
  FileDown,
  Send,
  CalendarClock,
  BarChart3,
  UserCircle2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { ActionItemStatus } from '@/types/database.types';
import SummaryActions from './SummaryActions';
import TranscriptToggle from './TranscriptToggle';

// ─── Colour palette mirroring tailwind.config speaker colours ────────────────
const SPEAKER_COLOURS = [
  { bg: 'bg-blue-50',   border: 'border-blue-300',   text: 'text-blue-800',   dot: 'bg-blue-500'   },
  { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-50',  border: 'border-amber-300',  text: 'text-amber-800',  dot: 'bg-amber-500'  },
  { bg: 'bg-red-50',    border: 'border-red-300',    text: 'text-red-800',    dot: 'bg-red-500'    },
  { bg: 'bg-violet-50', border: 'border-violet-300', text: 'text-violet-800', dot: 'bg-violet-500' },
  { bg: 'bg-pink-50',   border: 'border-pink-300',   text: 'text-pink-800',   dot: 'bg-pink-500'   },
  { bg: 'bg-cyan-50',   border: 'border-cyan-300',   text: 'text-cyan-800',   dot: 'bg-cyan-500'   },
  { bg: 'bg-lime-50',   border: 'border-lime-300',   text: 'text-lime-800',   dot: 'bg-lime-500'   },
] as const;

function actionItemBadge(status: ActionItemStatus) {
  switch (status) {
    case 'open':
      return (
        <Badge variant="info" className="gap-1">
          <Circle className="w-3 h-3" /> Open
        </Badge>
      );
    case 'done':
      return (
        <Badge variant="success" className="gap-1">
          <CheckCircle2 className="w-3 h-3" /> Done
        </Badge>
      );
    case 'overdue':
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="w-3 h-3" /> Overdue
        </Badge>
      );
  }
}

function secondsToDisplay(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function MeetingSummaryPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  // Auth guard
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const meetingId = params.id;

  // ── Fetch meeting ──────────────────────────────────────────────────────────
  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', meetingId)
    .single();

  if (meetingError || !meeting) notFound();

  // ── Fetch current user's company membership (access control) ──────────────
  const { data: currentUser } = await supabase
    .from('users')
    .select('id, company_id, role')
    .eq('id', session.user.id)
    .single();

  if (!currentUser || currentUser.company_id !== meeting.company_id) notFound();

  // ── Parallel data fetching ─────────────────────────────────────────────────
  const [
    { data: attendees },
    { data: summary },
    { data: actionItems },
    { data: agendaItems },
    { data: transcript },
  ] = await Promise.all([
    supabase
      .from('meeting_attendees')
      .select('*, users(id, full_name, avatar_url, email)')
      .eq('meeting_id', meetingId),
    supabase
      .from('summaries')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('action_items')
      .select('*, assigned_to:users!action_items_assigned_to_user_id_fkey(id, full_name, avatar_url)')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: true }),
    supabase
      .from('agenda_items')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('position_order', { ascending: true }),
    supabase
      .from('transcripts')
      .select('full_text')
      .eq('meeting_id', meetingId)
      .maybeSingle(),
  ]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const presentAttendees  = (attendees ?? []).filter((a) => a.is_present);
  const absentAttendees   = (attendees ?? []).filter((a) => !a.is_present);

  const totalSpeakingSeconds = presentAttendees.reduce(
    (acc, a) => acc + (a.speaking_time_seconds ?? 0),
    0
  );

  const completedAgenda  = (agendaItems ?? []).filter((i) => i.completed);
  const agendaCoverage   =
    agendaItems && agendaItems.length > 0
      ? Math.round((completedAgenda.length / agendaItems.length) * 100)
      : 0;

  // Parse stored JSON summary (ai_summary stores the raw JSON string)
  let parsedSummary: {
    overall_summary?: string;
    per_speaker?: Array<{
      speaker_label: string;
      speaker_name: string;
      summary: string;
      key_points: string[];
    }>;
    agenda_coverage?: {
      completed_items: string[];
      uncovered_items: string[];
    };
    meeting_quality_score?: number;
  } | null = null;

  if (summary?.ai_summary) {
    try {
      parsedSummary = JSON.parse(summary.ai_summary);
    } catch {
      // Stored as plain text — show as-is
    }
  }

  const isOrganiser = meeting.organiser_id === session.user.id;
  const isAdmin     = currentUser.role === 'admin';
  const canExport   = ['pro', 'team', 'enterprise'].includes(currentUser.role);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top nav bar ────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>

          <span className="text-gray-300 select-none">|</span>

          <h1 className="font-semibold text-gray-900 truncate">{meeting.title}</h1>

          {meeting.started_at && (
            <span className="ml-auto text-xs text-gray-400 shrink-0">
              {format(parseISO(meeting.started_at), 'PPP · p')}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── Absent member notice ──────────────────────────────────────── */}
        {absentAttendees.length > 0 && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3"
          >
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {absentAttendees.length} attendee{absentAttendees.length > 1 ? 's' : ''} absent
              </p>
              <p className="text-sm text-amber-700 mt-0.5">
                {absentAttendees
                  .map((a) => {
                    const u = a.users as unknown as { full_name: string } | null;
                    return u?.full_name ?? a.guest_name ?? 'Unknown';
                  })
                  .join(', ')}
              </p>
            </div>
          </div>
        )}

        {/* ── Stats row ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            icon={<Users className="w-4 h-4 text-blue-500" />}
            label="Attendees"
            value={`${presentAttendees.length} / ${(attendees ?? []).length}`}
          />
          <StatCard
            icon={<Clock className="w-4 h-4 text-emerald-500" />}
            label="Duration"
            value={
              meeting.duration_seconds
                ? secondsToDisplay(meeting.duration_seconds)
                : '—'
            }
          />
          <StatCard
            icon={<BarChart3 className="w-4 h-4 text-violet-500" />}
            label="Agenda Coverage"
            value={`${agendaCoverage}%`}
          />
          <StatCard
            icon={<FileText className="w-4 h-4 text-amber-500" />}
            label="Action Items"
            value={String((actionItems ?? []).length)}
          />
        </div>

        {/* ── Agenda coverage progress bar ──────────────────────────────── */}
        {agendaItems && agendaItems.length > 0 && (
          <section aria-labelledby="agenda-heading">
            <h2
              id="agenda-heading"
              className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2"
            >
              <BarChart3 className="w-4 h-4 text-violet-500" />
              Agenda Coverage
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>{completedAgenda.length} of {agendaItems.length} items completed</span>
                  <span className="font-semibold text-gray-900">{agendaCoverage}%</span>
                </div>
                <div className="w-full h-3 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all duration-700"
                    style={{ width: `${agendaCoverage}%` }}
                    role="progressbar"
                    aria-valuenow={agendaCoverage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
              </div>

              {/* Item list */}
              <ul className="space-y-1.5">
                {agendaItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 text-sm">
                    {item.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-gray-300 shrink-0" />
                    )}
                    <span className={item.completed ? 'text-gray-900' : 'text-gray-400'}>
                      {item.title}
                    </span>
                    {item.duration_minutes > 0 && (
                      <span className="ml-auto text-gray-400 text-xs">{item.duration_minutes}m</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ── Speaker blocks grid ───────────────────────────────────────── */}
        {presentAttendees.length > 0 && (
          <section aria-labelledby="speakers-heading">
            <h2
              id="speakers-heading"
              className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2"
            >
              <Users className="w-4 h-4 text-blue-500" />
              Speaker Breakdown
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {presentAttendees.map((attendee, idx) => {
                const colour  = SPEAKER_COLOURS[idx % SPEAKER_COLOURS.length];
                const user    = attendee.users as unknown as { full_name: string; avatar_url?: string } | null;
                const name    = user?.full_name ?? attendee.guest_name ?? `Speaker ${idx + 1}`;
                const pct     = totalSpeakingSeconds > 0
                  ? Math.round((attendee.speaking_time_seconds / totalSpeakingSeconds) * 100)
                  : 0;

                // Match per-speaker summary from parsedSummary
                const speakerSummary = parsedSummary?.per_speaker?.find(
                  (s) =>
                    s.speaker_name?.toLowerCase() === name.toLowerCase() ||
                    s.speaker_label === `speaker_${idx + 1}`
                );

                return (
                  <div
                    key={attendee.id}
                    className={`rounded-xl border ${colour.border} ${colour.bg} p-4 flex flex-col gap-3`}
                  >
                    {/* Header */}
                    <div className="flex items-center gap-2">
                      {user?.avatar_url ? (
                        <img
                          src={user.avatar_url}
                          alt={name}
                          className="w-8 h-8 rounded-full object-cover border border-white shadow-sm"
                        />
                      ) : (
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${colour.dot}`}
                        >
                          {initials(name)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${colour.text} truncate`}>{name}</p>
                        <p className="text-xs text-gray-500">
                          {secondsToDisplay(attendee.speaking_time_seconds)} speaking
                        </p>
                      </div>
                      <span className={`text-lg font-bold ${colour.text}`}>{pct}%</span>
                    </div>

                    {/* Speaking time bar */}
                    <div className="w-full h-1.5 rounded-full bg-white/60">
                      <div
                        className={`h-full rounded-full ${colour.dot} transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {/* Key points */}
                    {speakerSummary?.key_points && speakerSummary.key_points.length > 0 && (
                      <ul className="space-y-1">
                        {speakerSummary.key_points.slice(0, 4).map((point, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                            <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${colour.dot}`} />
                            {point}
                          </li>
                        ))}
                      </ul>
                    )}

                    {speakerSummary?.summary && (
                      <p className="text-xs text-gray-600 italic leading-relaxed">
                        {speakerSummary.summary}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── AI Summary ────────────────────────────────────────────────── */}
        <section aria-labelledby="ai-summary-heading">
          <h2
            id="ai-summary-heading"
            className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2"
          >
            <FileText className="w-4 h-4 text-indigo-500" />
            AI Meeting Summary
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            {summary ? (
              <>
                {parsedSummary?.overall_summary ? (
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                    {parsedSummary.overall_summary}
                  </p>
                ) : (
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                    {summary.ai_summary}
                  </p>
                )}
                {parsedSummary?.meeting_quality_score !== undefined && (
                  <div className="mt-4 flex items-center gap-2">
                    <span className="text-xs text-gray-500">Meeting quality score:</span>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 10 }, (_, i) => (
                        <div
                          key={i}
                          className={`w-2.5 h-2.5 rounded-sm ${
                            i < (parsedSummary?.meeting_quality_score ?? 0)
                              ? 'bg-indigo-500'
                              : 'bg-gray-200'
                          }`}
                        />
                      ))}
                      <span className="ml-1 text-xs font-semibold text-gray-700">
                        {parsedSummary.meeting_quality_score}/10
                      </span>
                    </div>
                  </div>
                )}
                <p className="mt-3 text-xs text-gray-400">
                  Generated {format(parseISO(summary.generated_at), 'PPp')}
                  {summary.sent_at && (
                    <> · Sent {format(parseISO(summary.sent_at), 'PPp')}</>
                  )}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400 italic">
                No summary generated yet. Use the &quot;Generate Summary&quot; button below.
              </p>
            )}
          </div>
        </section>

        {/* ── Action items ──────────────────────────────────────────────── */}
        <section aria-labelledby="action-items-heading">
          <h2
            id="action-items-heading"
            className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2"
          >
            <CalendarClock className="w-4 h-4 text-orange-500" />
            Action Items
            {actionItems && actionItems.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {actionItems.length}
              </Badge>
            )}
          </h2>

          {actionItems && actionItems.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {actionItems.map((item) => {
                const assignee = item.assigned_to as unknown as {
                  id: string;
                  full_name: string;
                  avatar_url: string | null;
                } | null;
                const isOverdue =
                  item.status === 'overdue' ||
                  (item.status === 'open' &&
                    item.due_date !== null &&
                    new Date(item.due_date) < new Date());

                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="mt-0.5">{actionItemBadge(isOverdue ? 'overdue' : item.status)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                      {item.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.description}</p>
                      )}
                      {item.due_date && (
                        <p className={`text-xs mt-1 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                          Due {format(parseISO(item.due_date), 'PP')}
                        </p>
                      )}
                    </div>
                    {assignee && (
                      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                        {assignee.avatar_url ? (
                          <img
                            src={assignee.avatar_url}
                            alt={assignee.full_name}
                            className="w-6 h-6 rounded-full object-cover"
                            title={assignee.full_name}
                          />
                        ) : (
                          <div
                            className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-700"
                            title={assignee.full_name}
                          >
                            {initials(assignee.full_name)}
                          </div>
                        )}
                        <span className="text-xs text-gray-500 hidden sm:inline">
                          {assignee.full_name.split(' ')[0]}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No action items yet.</p>
            </div>
          )}
        </section>

        {/* ── Full transcript toggle ────────────────────────────────────── */}
        {transcript?.full_text && (
          <section aria-labelledby="transcript-heading">
            <h2
              id="transcript-heading"
              className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2"
            >
              <ChevronDown className="w-4 h-4 text-gray-400" />
              Full Transcript
            </h2>
            <TranscriptToggle transcript={transcript.full_text} />
          </section>
        )}

        {/* ── Export / send actions ─────────────────────────────────────── */}
        <section aria-label="Meeting actions">
          <SummaryActions
            meetingId={meetingId}
            meetingTitle={meeting.title}
            isOrganiser={isOrganiser}
            isAdmin={isAdmin}
            hasSummary={!!summary}
          />
        </section>
      </main>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-gray-500 text-xs font-medium uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
