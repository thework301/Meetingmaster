import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { formatDate, formatDuration } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Calendar, Clock, Users, TrendingUp, AlertCircle } from 'lucide-react';
import { WeeklyChart } from '@/components/dashboard/weekly-chart';
import { ActionItemChip } from '@/components/dashboard/action-item-chip';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { folder?: string; filter?: string };
}) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: currentUser } = await supabase
    .from('users')
    .select('company_id, full_name, plan')
    .eq('id', session.user.id)
    .single();

  if (!currentUser) redirect('/login');

  // Stats
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: recentMeetings } = await supabase
    .from('meetings')
    .select(`
      id, title, status, started_at, ended_at, duration_seconds, meeting_type,
      meeting_attendees(count),
      summaries(id, sent_at)
    `)
    .eq('company_id', currentUser.company_id)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(20);

  const { data: myActionItems } = await supabase
    .from('action_items')
    .select('id, title, status, due_date, escalated')
    .eq('assigned_to_user_id', session.user.id)
    .in('status', ['open', 'overdue'])
    .order('due_date', { ascending: true })
    .limit(10);

  const { count: totalMeetings } = await supabase
    .from('meetings')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', currentUser.company_id)
    .eq('status', 'completed')
    .gte('created_at', thirtyDaysAgo.toISOString());

  const { count: overdueCount } = await supabase
    .from('action_items')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to_user_id', session.user.id)
    .eq('status', 'overdue');

  // Total meeting time this month
  const { data: durations } = await supabase
    .from('meetings')
    .select('duration_seconds')
    .eq('company_id', currentUser.company_id)
    .eq('status', 'completed')
    .gte('created_at', thirtyDaysAgo.toISOString());

  const totalSeconds = durations?.reduce((sum, m) => sum + (m.duration_seconds || 0), 0) || 0;

  // Weekly data for chart (last 7 weeks)
  const weeklyData = Array.from({ length: 7 }, (_, i) => {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - (6 - i) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return {
      week: weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      meetings: 0,
      hours: 0,
      start: weekStart.toISOString(),
      end: weekEnd.toISOString(),
    };
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome back, {currentUser.full_name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">Here&apos;s what&apos;s happening with your meetings</p>
        </div>
        <Link
          href="/meeting/new"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Calendar className="w-4 h-4" />
          New Meeting
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'Meetings (30d)',
            value: totalMeetings || 0,
            icon: Calendar,
            colour: 'text-blue-600',
            bg: 'bg-blue-50',
          },
          {
            label: 'Meeting Time',
            value: formatDuration(totalSeconds),
            icon: Clock,
            colour: 'text-green-600',
            bg: 'bg-green-50',
          },
          {
            label: 'My Actions',
            value: myActionItems?.length || 0,
            icon: TrendingUp,
            colour: 'text-purple-600',
            bg: 'bg-purple-50',
          },
          {
            label: 'Overdue',
            value: overdueCount || 0,
            icon: AlertCircle,
            colour: overdueCount ? 'text-red-600' : 'text-slate-600',
            bg: overdueCount ? 'bg-red-50' : 'bg-slate-50',
          },
        ].map(({ label, value, icon: Icon, colour, bg }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
                  <p className={`text-2xl font-bold mt-1 ${colour}`}>{value}</p>
                </div>
                <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${colour}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Weekly chart */}
        <div className="md:col-span-2">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Meeting Time (Last 7 Weeks)</CardTitle>
            </CardHeader>
            <CardContent>
              <WeeklyChart companyId={currentUser.company_id} />
            </CardContent>
          </Card>
        </div>

        {/* My action items */}
        <div>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">My Action Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {myActionItems && myActionItems.length > 0 ? (
                myActionItems.map(item => (
                  <ActionItemChip key={item.id} item={item} />
                ))
              ) : (
                <p className="text-sm text-slate-400 py-4 text-center">All caught up!</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent meetings */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Recent Meetings</CardTitle>
            <div className="flex gap-2">
              {['all', 'completed', 'scheduled'].map(f => (
                <Link
                  key={f}
                  href={`/dashboard?filter=${f}`}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors capitalize ${
                    (searchParams.filter || 'all') === f
                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {f}
                </Link>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recentMeetings && recentMeetings.length > 0 ? (
            <div className="divide-y">
              {recentMeetings
                .filter(m => !searchParams.filter || searchParams.filter === 'all' || m.status === searchParams.filter)
                .map(meeting => (
                  <Link
                    key={meeting.id}
                    href={meeting.status === 'completed' ? `/meeting/${meeting.id}/summary` : `/meeting/${meeting.id}/live`}
                    className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        meeting.status === 'completed' ? 'bg-green-400' :
                        meeting.status === 'in_progress' ? 'bg-red-400 animate-pulse' :
                        'bg-slate-300'
                      }`} />
                      <div>
                        <p className="text-sm font-medium text-slate-900 group-hover:text-blue-600">
                          {meeting.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {meeting.started_at ? formatDate(meeting.started_at) : 'Not started'} ·{' '}
                          {meeting.duration_seconds ? formatDuration(meeting.duration_seconds) : '—'} ·{' '}
                          {(meeting.meeting_attendees as unknown as { count: number }[])?.[0]?.count || 0} attendees
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          meeting.status === 'completed' ? 'success' :
                          meeting.status === 'in_progress' ? 'destructive' :
                          'secondary'
                        }
                      >
                        {meeting.status.replace('_', ' ')}
                      </Badge>
                      {meeting.status === 'completed' && !(meeting.summaries as unknown as unknown[])?.length && (
                        <Badge variant="warning">No summary</Badge>
                      )}
                    </div>
                  </Link>
                ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No meetings yet</p>
              <p className="text-slate-400 text-sm mt-1">Start your first meeting to see it here</p>
              <Link href="/meeting/new" className="mt-4 inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                <Calendar className="w-4 h-4" /> New Meeting
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
