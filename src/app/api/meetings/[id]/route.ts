import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const updateSchema = z.object({
  status: z.enum(['scheduled', 'in_progress', 'completed']).optional(),
  ended_at: z.string().datetime().optional(),
  started_at: z.string().datetime().optional(),
  duration_seconds: z.number().int().min(0).optional(),
  title: z.string().min(1).max(500).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const supabase = createClient();
  const { data: meeting, error: fetchError } = await supabase
    .from('meetings')
    .select(`
      *,
      agenda_items(*),
      meeting_attendees(
        *,
        users(id, full_name, email, avatar_url)
      ),
      transcripts(
        id, full_text, created_at,
        speaker_segments(*)
      ),
      summaries(*)
    `)
    .eq('id', params.id)
    .single();

  if (fetchError || !meeting) {
    return NextResponse.json({ error: 'Meeting not found', detail: fetchError?.message }, { status: 404 });
  }

  // Ensure user is in same company
  if (meeting.company_id !== user.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Sort agenda items by position_order
  if (meeting.agenda_items) {
    meeting.agenda_items.sort((a: { position_order: number }, b: { position_order: number }) => a.position_order - b.position_order);
  }

  return NextResponse.json({ meeting });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = createClient();

  // Verify meeting belongs to company and user is organiser or admin
  const { data: existing } = await supabase
    .from('meetings')
    .select('company_id, organiser_id, started_at')
    .eq('id', params.id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (existing.company_id !== user.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (existing.organiser_id !== user.id && user.role !== 'admin') {
    return NextResponse.json({ error: 'Only the organiser or admin can update this meeting' }, { status: 403 });
  }

  // If completing meeting, calculate duration
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === 'completed' && parsed.data.ended_at && existing.started_at) {
    const start = new Date(existing.started_at).getTime();
    const end = new Date(parsed.data.ended_at).getTime();
    updateData.duration_seconds = Math.round((end - start) / 1000);
  }

  const { data, error: updateError } = await supabase
    .from('meetings')
    .update(updateData)
    .eq('id', params.id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({ meeting: data });
}
