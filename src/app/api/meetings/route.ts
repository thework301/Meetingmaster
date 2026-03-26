import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { PLAN_LIMITS } from '@/lib/utils';

const agendaItemSchema = z.object({
  title: z.string().min(1).max(300),
  duration_minutes: z.number().min(1).max(480).default(5),
  owner_user_id: z.string().uuid().optional().nullable(),
  position_order: z.number().default(0),
});

const attendeeSchema = z.object({
  user_id: z.string().uuid().optional().nullable(),
  guest_name: z.string().max(200).optional().nullable(),
  guest_email: z.string().email().optional().nullable(),
});

const settingsSchema = z.object({
  transcription_enabled: z.boolean().default(true),
  auto_summary_enabled: z.boolean().default(true),
  send_absent_email: z.boolean().default(true),
});

const createMeetingSchema = z.object({
  title: z.string().min(1).max(500),
  meeting_type: z.string().min(1).max(100),
  folder_id: z.string().uuid().optional().nullable(),
  is_series: z.boolean().default(false),
  series_id: z.string().uuid().optional().nullable(),
  agenda_items: z.array(agendaItemSchema).max(50),
  attendees: z.array(attendeeSchema).max(100),
  settings: settingsSchema,
});

export async function POST(request: NextRequest) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createMeetingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const supabase = createClient();

  // Check plan limits
  const limits = PLAN_LIMITS[user.plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free;

  // Free plan: max 5 meetings per month
  if (limits.meetings_per_month !== Infinity) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from('meetings')
      .select('id', { count: 'exact', head: true })
      .eq('organiser_id', user.id)
      .gte('created_at', monthStart.toISOString());

    if ((count || 0) >= limits.meetings_per_month) {
      return NextResponse.json(
        { error: `Free plan limited to ${limits.meetings_per_month} meetings per month. Please upgrade.`, upgrade: true },
        { status: 402 }
      );
    }
  }

  // Free plan: max 4 attendees
  if (limits.max_attendees !== Infinity && data.attendees.length > limits.max_attendees) {
    return NextResponse.json(
      { error: `Free plan limited to ${limits.max_attendees} attendees. Please upgrade.`, upgrade: true },
      { status: 402 }
    );
  }

  // Create meeting
  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .insert({
      title: data.title,
      company_id: user.company_id,
      organiser_id: user.id,
      folder_id: data.folder_id || null,
      series_id: data.series_id || null,
      meeting_type: data.meeting_type,
      is_series: data.is_series,
      status: 'scheduled',
    })
    .select('id')
    .single();

  if (meetingError || !meeting) {
    return NextResponse.json({ error: 'Failed to create meeting' }, { status: 500 });
  }

  // Insert agenda items
  if (data.agenda_items.length > 0) {
    await supabase.from('agenda_items').insert(
      data.agenda_items.map((item, idx) => ({
        meeting_id: meeting.id,
        title: item.title,
        duration_minutes: item.duration_minutes,
        owner_user_id: item.owner_user_id || null,
        position_order: idx,
        completed: false,
      }))
    );
  }

  // Insert attendees (organiser always included)
  const allAttendees = [
    { user_id: user.id, is_present: false, speaking_time_seconds: 0 },
    ...data.attendees
      .filter(a => a.user_id !== user.id) // Don't duplicate organiser
      .map(a => ({
        user_id: a.user_id || null,
        guest_name: a.guest_name || null,
        guest_email: a.guest_email || null,
        is_present: false,
        speaking_time_seconds: 0,
      })),
  ];

  await supabase.from('meeting_attendees').insert(
    allAttendees.map(a => ({ ...a, meeting_id: meeting.id }))
  );

  return NextResponse.json({ id: meeting.id }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const supabase = createClient();
  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get('folder_id');
  const status = searchParams.get('status');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

  let query = supabase
    .from('meetings')
    .select(`
      id, title, status, meeting_type, started_at, ended_at, duration_seconds,
      is_series, series_id, folder_id, created_at,
      meeting_attendees(count),
      summaries(id)
    `)
    .eq('company_id', user.company_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (folderId) query = query.eq('folder_id', folderId);
  if (status) query = query.eq('status', status);

  const { data: meetings, error: fetchError } = await query;

  if (fetchError) {
    return NextResponse.json({ error: 'Failed to fetch meetings' }, { status: 500 });
  }

  return NextResponse.json({ meetings: meetings || [] });
}
