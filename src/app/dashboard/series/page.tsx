import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { SeriesTimeline } from '@/components/series/timeline';

export default async function SeriesPage() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: user } = await supabase
    .from('users')
    .select('company_id, plan')
    .eq('id', session.user.id)
    .single();

  if (!user) redirect('/login');

  const { data: series } = await supabase
    .from('meeting_series')
    .select(`
      *,
      meetings(id, title, started_at, status),
      series_milestones(*)
    `)
    .eq('company_id', user.company_id)
    .order('started_at', { ascending: false });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Series Timeline</h1>
        <p className="text-slate-500 text-sm mt-1">Track the progress of your recurring meeting series</p>
      </div>

      {series && series.length > 0 ? (
        <SeriesTimeline series={series} />
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-300">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📅</span>
          </div>
          <p className="text-slate-600 font-medium">No meeting series yet</p>
          <p className="text-slate-400 text-sm mt-1">Create a series when starting a recurring meeting</p>
        </div>
      )}
    </div>
  );
}
