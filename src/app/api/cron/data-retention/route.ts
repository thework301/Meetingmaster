import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Get all companies with their retention settings
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, data_retention_months');

  let deletedCount = 0;

  for (const company of companies || []) {
    if (company.data_retention_months >= 999) continue; // Never delete

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - company.data_retention_months);

    const { data: oldMeetings, count } = await supabase
      .from('meetings')
      .select('id', { count: 'exact' })
      .eq('company_id', company.id)
      .lt('created_at', cutoff.toISOString());

    if (count && count > 0 && oldMeetings) {
      // Delete in batches — cascades to transcripts, segments, summaries, action_items
      const ids = oldMeetings.map(m => m.id);
      await supabase.from('meetings').delete().in('id', ids);
      deletedCount += count;
    }
  }

  return NextResponse.json({ deleted_meetings: deletedCount });
}
