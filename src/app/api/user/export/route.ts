import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const supabase = createClient();

  // Gather all user data
  const [
    { data: profile },
    { data: meetings },
    { data: actionItems },
    { data: attendances },
    { data: transcripts },
  ] = await Promise.all([
    supabase.from('users').select('*').eq('id', user.id).single(),
    supabase.from('meetings').select('*').eq('organiser_id', user.id),
    supabase.from('action_items').select('*').eq('assigned_to_user_id', user.id),
    supabase.from('meeting_attendees').select('*').eq('user_id', user.id),
    supabase
      .from('transcripts')
      .select('*, meetings!inner(organiser_id)')
      .eq('meetings.organiser_id', user.id),
  ]);

  const exportData = {
    exported_at: new Date().toISOString(),
    profile: {
      id: profile?.id,
      email: profile?.email,
      full_name: profile?.full_name,
      role: profile?.role,
      plan: profile?.plan,
      created_at: profile?.created_at,
      last_active_at: profile?.last_active_at,
    },
    meetings_organised: meetings?.map(m => ({
      id: m.id,
      title: m.title,
      status: m.status,
      started_at: m.started_at,
      ended_at: m.ended_at,
      duration_seconds: m.duration_seconds,
    })),
    action_items: actionItems?.map(a => ({
      id: a.id,
      title: a.title,
      description: a.description,
      due_date: a.due_date,
      status: a.status,
      created_at: a.created_at,
    })),
    meeting_attendance: attendances?.map(a => ({
      meeting_id: a.meeting_id,
      is_present: a.is_present,
      speaking_time_seconds: a.speaking_time_seconds,
    })),
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="my-meeting-master-data-${new Date().toISOString().split('T')[0]}.json"`,
    },
  });
}
