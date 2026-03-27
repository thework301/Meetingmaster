import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const segmentSchema = z.object({
  speaker_label: z.string().max(50),
  speaker_name: z.string().max(200).optional().nullable(),
  start_time_seconds: z.number().min(0),
  end_time_seconds: z.number().min(0),
  text_content: z.string().max(5000),
});

const saveTranscriptSchema = z.object({
  segments: z.array(segmentSchema).max(10000),
  full_text: z.string().max(1000000).optional(),
});

const assignNameSchema = z.object({
  speaker_label: z.string().max(50),
  speaker_name: z.string().min(1).max(200),
  transcript_id: z.string().uuid(),
});

export async function POST(
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

  const parsed = saveTranscriptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = createClient();

  // Verify meeting belongs to company
  const { data: meeting } = await supabase
    .from('meetings')
    .select('company_id, organiser_id')
    .eq('id', params.id)
    .single();

  if (!meeting || meeting.company_id !== user.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const full_text = parsed.data.full_text ||
    parsed.data.segments.map(s => `[${s.speaker_label}]: ${s.text_content}`).join('\n');

  // Find existing transcript or create new one
  const { data: existing } = await supabase
    .from('transcripts')
    .select('id')
    .eq('meeting_id', params.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let transcript: { id: string } | null = null;

  if (existing) {
    // Update existing transcript
    const { data: updated, error: updateError } = await supabase
      .from('transcripts')
      .update({ full_text })
      .eq('id', existing.id)
      .select('id')
      .single();
    if (updateError || !updated) {
      return NextResponse.json({ error: 'Failed to update transcript' }, { status: 500 });
    }
    transcript = updated;
  } else {
    // Insert new transcript
    const { data: inserted, error: insertError } = await supabase
      .from('transcripts')
      .insert({ meeting_id: params.id, full_text })
      .select('id')
      .single();
    if (insertError || !inserted) {
      return NextResponse.json({ error: 'Failed to save transcript' }, { status: 500 });
    }
    transcript = inserted;
  }

  // Delete existing segments and re-insert
  await supabase.from('speaker_segments').delete().eq('transcript_id', transcript.id);

  if (parsed.data.segments.length > 0) {
    const { error: segError } = await supabase.from('speaker_segments').insert(
      parsed.data.segments.map(s => ({
        transcript_id: transcript.id,
        speaker_label: s.speaker_label,
        speaker_name: s.speaker_name || null,
        start_time_seconds: s.start_time_seconds,
        end_time_seconds: s.end_time_seconds,
        text_content: s.text_content,
      }))
    );

    if (segError) {
      return NextResponse.json({ error: 'Failed to save segments' }, { status: 500 });
    }
  }

  return NextResponse.json({ transcript_id: transcript.id, segments_saved: parsed.data.segments.length });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Assign a speaker name to all segments with a given label
  const { user, error } = await requireAuth(request);
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = assignNameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = createClient();

  // Verify meeting belongs to company
  const { data: meeting } = await supabase
    .from('meetings')
    .select('company_id')
    .eq('id', params.id)
    .single();

  if (!meeting || meeting.company_id !== user.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error: updateError } = await supabase
    .from('speaker_segments')
    .update({ speaker_name: parsed.data.speaker_name })
    .eq('transcript_id', parsed.data.transcript_id)
    .eq('speaker_label', parsed.data.speaker_label);

  if (updateError) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  // Also update meeting_attendees introduced_at if guest
  const { data: attendee } = await supabase
    .from('meeting_attendees')
    .select('id, introduced_at')
    .eq('meeting_id', params.id)
    .eq('guest_name', parsed.data.speaker_name)
    .single();

  if (attendee && !attendee.introduced_at) {
    await supabase
      .from('meeting_attendees')
      .update({ introduced_at: new Date().toISOString() })
      .eq('id', attendee.id);
  }

  return NextResponse.json({ updated: true });
}
