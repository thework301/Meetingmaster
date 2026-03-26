import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { ActionItemToggle } from '@/components/actions/action-item-toggle';

export default async function ActionsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const filter = searchParams.filter || 'open';

  let query = supabase
    .from('action_items')
    .select(`
      id, title, description, due_date, status, escalated, escalated_at, created_at,
      assigned_by: users!action_items_assigned_by_user_id_fkey(full_name),
      meetings(id, title)
    `)
    .eq('assigned_to_user_id', session.user.id)
    .order('due_date', { ascending: true, nullsFirst: false });

  if (filter !== 'all') {
    if (filter === 'open') {
      query = query.in('status', ['open', 'overdue']);
    } else {
      query = query.eq('status', filter);
    }
  }

  const { data: actionItems } = await query;

  const counts = {
    open: actionItems?.filter(i => i.status === 'open').length || 0,
    overdue: actionItems?.filter(i => i.status === 'overdue').length || 0,
    done: actionItems?.filter(i => i.status === 'done').length || 0,
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Action Items</h1>
        <p className="text-slate-500 text-sm mt-1">Tasks assigned to you from meetings</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Open', count: counts.open, icon: Clock, colour: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Overdue', count: counts.overdue, icon: AlertCircle, colour: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Done', count: counts.done, icon: CheckCircle, colour: 'text-green-600', bg: 'bg-green-50' },
        ].map(({ label, count, icon: Icon, colour, bg }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className={`text-2xl font-bold ${colour}`}>{count}</p>
                </div>
                <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${colour}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter pills */}
      <div className="flex gap-2">
        {[
          { key: 'open', label: 'Open & Overdue' },
          { key: 'done', label: 'Completed' },
          { key: 'all', label: 'All' },
        ].map(({ key, label }) => (
          <Link
            key={key}
            href={`/dashboard/actions?filter=${key}`}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              filter === key
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Action items list */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {actionItems && actionItems.length > 0 ? (
            <div className="divide-y">
              {actionItems.map(item => (
                <div key={item.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start gap-3">
                    <ActionItemToggle itemId={item.id} status={item.status as 'open' | 'done' | 'overdue'} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-medium text-slate-900 ${item.status === 'done' ? 'line-through text-slate-400' : ''}`}>
                          {item.title}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge
                            variant={
                              item.status === 'done' ? 'success' :
                              item.status === 'overdue' ? 'destructive' :
                              'info'
                            }
                          >
                            {item.status}
                          </Badge>
                          {item.escalated && (
                            <Badge variant="destructive">Escalated</Badge>
                          )}
                        </div>
                      </div>
                      {item.description && (
                        <p className="text-xs text-slate-500 mt-1">{item.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                        {item.due_date && (
                          <span className={item.status === 'overdue' ? 'text-red-500 font-medium' : ''}>
                            Due {formatDate(item.due_date)}
                          </span>
                        )}
                        <span>
                          From:{' '}
                          <Link
                            href={`/meeting/${(item.meetings as {id: string; title: string} | null)?.id}/summary`}
                            className="hover:text-blue-600 hover:underline"
                          >
                            {(item.meetings as {id: string; title: string} | null)?.title}
                          </Link>
                        </span>
                        <span>By {(item.assigned_by as {full_name: string} | null)?.full_name}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <CheckCircle className="w-10 h-10 text-green-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">
                {filter === 'done' ? 'No completed actions' : 'All caught up!'}
              </p>
              <p className="text-slate-400 text-sm mt-1">
                {filter === 'done' ? 'Complete some actions to see them here' : 'You have no open action items'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
