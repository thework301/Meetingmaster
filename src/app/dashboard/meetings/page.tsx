import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { formatDate, formatDuration } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Calendar, Clock, Users, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default async function MeetingsPage() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: currentUser } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', session.user.id)
    .single();

  if (!currentUser) redirect('/login');

  const { data: meetings } = await supabase
    .from('meetings')
    .select(`
      id, title, status, started_at, ended_at, duration_seconds, meeting_type, created_at,
      meeting_attendees(count)
    `)
    .eq('company_id', currentUser.company_id)
    .order('created_at', { ascending: false })
    .limit(50);

  const statusColour: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-green-100 text-green-700',
    completed: 'bg-slate-100 text-slate-600',
    cancelled: 'bg-red-100 text-red-600',
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Meetings</h1>
          <p className="text-slate-500 text-sm mt-1">{meetings?.length ?? 0} meetings</p>
        </div>
        <Link href="/meeting/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            New Meeting
          </Button>
        </Link>
      </div>

      {(!meetings || meetings.length === 0) ? (
        <div className="text-center py-16 text-slate-400">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No meetings yet</p>
          <p className="text-sm mt-1">Start by creating your first meeting.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {meetings.map((m) => (
            <Link
              key={m.id}
              href={m.status === 'completed' ? `/meeting/${m.id}/summary` : `/meeting/${m.id}/live`}
              className="flex items-center justify-between p-4 bg-white rounded-lg border hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{m.title}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {m.started_at ? formatDate(m.started_at) : formatDate(m.created_at)}
                    </span>
                    {m.duration_seconds && (
                      <span>{formatDuration(m.duration_seconds)}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {/* @ts-ignore */}
                      {m.meeting_attendees?.[0]?.count ?? 0} attendees
                    </span>
                    {m.meeting_type && (
                      <span className="capitalize">{m.meeting_type.replace('_', ' ')}</span>
                    )}
                  </div>
                </div>
              </div>
              <Badge className={`shrink-0 text-xs ${statusColour[m.status] ?? 'bg-slate-100 text-slate-600'}`}>
                {m.status.replace('_', ' ')}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
