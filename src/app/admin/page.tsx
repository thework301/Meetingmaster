import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { formatDate, formatDuration } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { AlertCircle, Calendar, Clock, Settings, Users } from 'lucide-react';
import { AdminWeeklyChart } from '@/components/admin/admin-weekly-chart';

export default async function AdminPage() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: currentUser } = await supabase
    .from('users')
    .select('company_id, role')
    .eq('id', session.user.id)
    .single();

  if (!currentUser || currentUser.role !== 'admin') redirect('/dashboard');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Overdue action items (company-wide)
  const { data: overdueItems } = await supabase
    .from('action_items')
    .select(`
      id, title, due_date, escalated, escalated_at,
      assigned_to: users!action_items_assigned_to_user_id_fkey(full_name, email),
      meetings(title)
    `)
    .eq('status', 'overdue')
    .order('due_date', { ascending: true });

  // Stats
  const { count: totalUsers } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', currentUser.company_id);

  const { count: totalMeetings } = await supabase
    .from('meetings')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', currentUser.company_id)
    .eq('status', 'completed')
    .gte('created_at', thirtyDaysAgo.toISOString());

  const { data: durations } = await supabase
    .from('meetings')
    .select('duration_seconds')
    .eq('company_id', currentUser.company_id)
    .eq('status', 'completed')
    .gte('created_at', thirtyDaysAgo.toISOString());

  const totalSeconds = durations?.reduce((s, m) => s + (m.duration_seconds || 0), 0) || 0;

  // Users table
  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, email, role, plan, last_active_at, avatar_url')
    .eq('company_id', currentUser.company_id)
    .order('full_name');

  // Attendance rates per user (last 30 days)
  const { data: attendanceData } = await supabase
    .from('meeting_attendees')
    .select('user_id, is_present, meetings!inner(company_id, started_at)')
    .eq('meetings.company_id', currentUser.company_id)
    .gte('meetings.started_at', thirtyDaysAgo.toISOString());

  const attendanceMap: Record<string, { present: number; total: number }> = {};
  attendanceData?.forEach(row => {
    if (!row.user_id) return;
    if (!attendanceMap[row.user_id]) attendanceMap[row.user_id] = { present: 0, total: 0 };
    attendanceMap[row.user_id].total++;
    if (row.is_present) attendanceMap[row.user_id].present++;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Panel</h1>
          <p className="text-slate-500 text-sm mt-1">Company-wide meeting analytics and management</p>
        </div>
        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Settings className="w-4 h-4" />
          Settings
        </Link>
      </div>

      {/* Overdue alert banner */}
      {overdueItems && overdueItems.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-800">
                {overdueItems.length} overdue action {overdueItems.length === 1 ? 'item' : 'items'} across the company
              </p>
              <div className="mt-2 space-y-1">
                {overdueItems.slice(0, 3).map(item => (
                  <p key={item.id} className="text-sm text-red-700">
                    • <strong>{(item.assigned_to as {full_name: string} | null)?.full_name}</strong>: {item.title}
                    {item.escalated && <span className="ml-2 text-xs bg-red-200 text-red-800 px-1.5 py-0.5 rounded">Escalated</span>}
                  </p>
                ))}
                {overdueItems.length > 3 && (
                  <p className="text-sm text-red-600">…and {overdueItems.length - 3} more</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Users', value: totalUsers || 0, icon: Users, colour: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Meetings (30d)', value: totalMeetings || 0, icon: Calendar, colour: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Meeting Time (30d)', value: formatDuration(totalSeconds), icon: Clock, colour: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Overdue Actions', value: overdueItems?.length || 0, icon: AlertCircle, colour: (overdueItems?.length || 0) > 0 ? 'text-red-600' : 'text-slate-600', bg: (overdueItems?.length || 0) > 0 ? 'bg-red-50' : 'bg-slate-50' },
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

      {/* Department chart */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Meeting Time by Week</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminWeeklyChart companyId={currentUser.company_id} />
        </CardContent>
      </Card>

      {/* Users table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Team Members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left p-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Member</th>
                  <th className="text-left p-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                  <th className="text-left p-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Attendance (30d)</th>
                  <th className="text-left p-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Last Active</th>
                  <th className="text-left p-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Plan</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users?.map(user => {
                  const att = attendanceMap[user.id];
                  const rate = att ? Math.round((att.present / att.total) * 100) : null;
                  const attColour =
                    rate === null ? 'text-slate-400' :
                    rate >= 80 ? 'text-green-600' :
                    rate >= 50 ? 'text-amber-600' :
                    'text-red-600';

                  const daysSinceActive = user.last_active_at
                    ? Math.floor((Date.now() - new Date(user.last_active_at).getTime()) / (1000 * 60 * 60 * 24))
                    : null;

                  return (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {user.avatar_url ? (
                            <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-medium">
                              {user.full_name?.[0] || '?'}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-slate-900">{user.full_name}</p>
                            <p className="text-xs text-slate-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant={user.role === 'admin' ? 'default' : user.role === 'viewer' ? 'secondary' : 'outline'}>
                          {user.role}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <span className={`text-sm font-medium ${attColour}`}>
                          {rate !== null ? `${rate}% (${att.present}/${att.total})` : 'No meetings'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-slate-500">
                          {daysSinceActive === null ? 'Never' :
                           daysSinceActive === 0 ? 'Today' :
                           daysSinceActive === 1 ? 'Yesterday' :
                           `${daysSinceActive}d ago`}
                        </span>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline" className="capitalize">{user.plan}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
