import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth, apiError } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PerSpeakerSummary {
  speaker_label: string;
  speaker_name: string;
  summary: string;
  key_points: string[];
}

interface ActionItemSuggestion {
  title: string;
  description: string;
  assignee_name: string;
  due_date_suggestion: string; // ISO date string or empty
}

interface AgendaCoverage {
  completed_items: string[];
  uncovered_items: string[];
}

interface MeetingSummaryResponse {
  overall_summary: string;
  per_speaker: PerSpeakerSummary[];
  action_items: ActionItemSuggestion[];
  agenda_coverage: AgendaCoverage;
  meeting_quality_score: number; // 1–10
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const { user, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const meetingId = params.id;
  const supabase  = createClient();
  const service   = createServiceClient();

  // ── Fetch meeting and verify access ───────────────────────────────────────
  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', meetingId)
    .single();

  if (meetingError || !meeting) {
    return apiError('Meeting not found', 404);
  }

  const isOrganiser = meeting.organiser_id === user.id;
  const isAdmin     = user.role === 'admin';

  if (!isOrganiser && !isAdmin) {
    return apiError('Only the organiser or an admin can generate a summary', 403);
  }

  if (meeting.company_id !== user.company_id) {
    return apiError('Access denied', 403);
  }

  // ── Fetch transcript ───────────────────────────────────────────────────────
  const { data: transcript } = await supabase
    .from('transcripts')
    .select('id, full_text')
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!transcript?.full_text?.trim()) {
    return apiError('No transcript found for this meeting. Please upload or record a transcript first.', 422);
  }

  // ── Fetch speaker segments for additional context ─────────────────────────
  const { data: speakerSegments } = await supabase
    .from('speaker_segments')
    .select('speaker_label, speaker_name, start_time_seconds, end_time_seconds, text_content')
    .eq('transcript_id', transcript.id)
    .order('start_time_seconds', { ascending: true });

  // ── Fetch agenda items ────────────────────────────────────────────────────
  const { data: agendaItems } = await supabase
    .from('agenda_items')
    .select('title, duration_minutes, completed, position_order')
    .eq('meeting_id', meetingId)
    .order('position_order', { ascending: true });

  // ── Fetch attendees ───────────────────────────────────────────────────────
  const { data: attendees } = await supabase
    .from('meeting_attendees')
    .select('*, users(id, full_name, email)')
    .eq('meeting_id', meetingId);

  // ── Build enriched transcript with speaker labels ─────────────────────────
  let enrichedTranscript = transcript.full_text;

  if (speakerSegments && speakerSegments.length > 0) {
    enrichedTranscript = speakerSegments
      .map((seg: { speaker_label: string; speaker_name: string | null; start_time_seconds: number; text_content: string }) => {
        const name  = seg.speaker_name ?? seg.speaker_label;
        const start = formatTime(seg.start_time_seconds);
        return `[${start}] ${name}: ${seg.text_content}`;
      })
      .join('\n');
  }

  // ── Build agenda context ───────────────────────────────────────────────────
  const agendaContext =
    agendaItems && agendaItems.length > 0
      ? `\nAGENDA ITEMS:\n${agendaItems
          .map(
            (a: { title: string; duration_minutes: number; completed: boolean }, i: number) =>
              `${i + 1}. ${a.title} (${a.duration_minutes}min) – ${a.completed ? 'COMPLETED' : 'NOT completed'}`
          )
          .join('\n')}`
      : '';

  // ── Build attendee context ─────────────────────────────────────────────────
  const attendeeContext =
    attendees && attendees.length > 0
      ? `\nATTENDEES:\n${attendees
          .map((a: { users: unknown; guest_name: string | null; is_present: boolean }) => {
            const u    = a.users as { full_name: string; email: string } | null;
            const name = u?.full_name ?? a.guest_name ?? 'Unknown';
            return `- ${name}${a.is_present ? ' (present)' : ' (absent)'}`;
          })
          .join('\n')}`
      : '';

  // ── Call Claude ────────────────────────────────────────────────────────────
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });

  const systemPrompt = `You are an expert meeting summariser for a business productivity platform.
Your job is to analyse meeting transcripts and extract structured insights.
Return ONLY valid JSON — no markdown, no code fences, no commentary outside the JSON object.
Be concise, professional, and action-oriented.`;

  const userPrompt = `Analyse the following meeting transcript and return a JSON object with this exact structure:

{
  "overall_summary": "2–4 sentence executive summary of the meeting",
  "per_speaker": [
    {
      "speaker_label": "speaker_1",
      "speaker_name": "Full Name or label if unknown",
      "summary": "1–2 sentence summary of this speaker's contributions",
      "key_points": ["point 1", "point 2", "point 3"]
    }
  ],
  "action_items": [
    {
      "title": "Short action item title",
      "description": "More detail about what needs to be done",
      "assignee_name": "Name of the person responsible (or empty string if unclear)",
      "due_date_suggestion": "ISO date string suggestion e.g. 2025-04-01, or empty string"
    }
  ],
  "agenda_coverage": {
    "completed_items": ["agenda item titles that were fully discussed"],
    "uncovered_items": ["agenda item titles that were skipped or not covered"]
  },
  "meeting_quality_score": 7
}

Rules:
- meeting_quality_score must be an integer from 1 to 10 based on: preparation, focus, decision-making, and follow-up clarity
- Extract ALL action items mentioned explicitly or implied
- key_points should be 3–5 bullet points per speaker maximum
- If a speaker name is unknown, use their label (e.g. "Speaker 1")
${agendaContext}
${attendeeContext}

MEETING TRANSCRIPT:
${enrichedTranscript}`;

  let parsedAI: MeetingSummaryResponse;

  try {
    const message = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role:    'user',
          content: userPrompt,
        },
      ],
      system: systemPrompt,
    });

    const rawText = message.content
      .filter((block: { type: string }) => block.type === 'text')
      .map((block: { type: string; text: string }) => block.text)
      .join('');

    // Strip any accidental markdown code fences
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    parsedAI = JSON.parse(cleaned) as MeetingSummaryResponse;
  } catch (err) {
    console.error('[summary/route] Claude API or parse error:', err);
    return NextResponse.json(
      { error: 'Failed to generate AI summary. Please try again.' },
      { status: 502 }
    );
  }

  // ── Persist summary ────────────────────────────────────────────────────────
  const summaryPayload = JSON.stringify(parsedAI);

  const { data: insertedSummary, error: summaryInsertError } = await service
    .from('summaries')
    .upsert(
      {
        meeting_id:  meetingId,
        ai_summary:  summaryPayload,
        generated_at: new Date().toISOString(),
        sent_at:     null,
      },
      { onConflict: 'meeting_id' }
    )
    .select()
    .single();

  if (summaryInsertError) {
    console.error('[summary/route] Failed to save summary:', summaryInsertError);
    return NextResponse.json(
      { error: 'Summary generated but could not be saved.' },
      { status: 500 }
    );
  }

  // ── Extract and persist action items ──────────────────────────────────────
  if (parsedAI.action_items && parsedAI.action_items.length > 0) {
    // Fetch company users for assignee matching
    const { data: companyUsers } = await service
      .from('users')
      .select('id, full_name')
      .eq('company_id', user.company_id);

    const actionItemRows = parsedAI.action_items.map((item) => {
      // Attempt to match assignee_name to a real user
      let assigneeId = user.id; // fallback to organiser
      if (item.assignee_name && companyUsers) {
        const normalised = item.assignee_name.toLowerCase().trim();
        const match = companyUsers.find(
          (u: { id: string; full_name: string }) =>
            u.full_name.toLowerCase() === normalised ||
            u.full_name.toLowerCase().includes(normalised) ||
            normalised.includes(u.full_name.toLowerCase().split(' ')[0])
        );
        if (match) assigneeId = match.id;
      }

      // Parse due date suggestion
      let dueDate: string | null = null;
      if (item.due_date_suggestion) {
        const parsed = new Date(item.due_date_suggestion);
        if (!isNaN(parsed.getTime())) {
          dueDate = parsed.toISOString().split('T')[0];
        }
      }

      return {
        meeting_id:           meetingId,
        series_id:            meeting.series_id ?? null,
        assigned_to_user_id:  assigneeId,
        assigned_by_user_id:  user.id,
        title:                item.title,
        description:          item.description || null,
        due_date:             dueDate,
        status:               'open' as const,
        escalated:            false,
        escalated_at:         null,
      };
    });

    const { error: actionItemsError } = await service
      .from('action_items')
      .insert(actionItemRows);

    if (actionItemsError) {
      console.error('[summary/route] Failed to insert action items:', actionItemsError);
      // Non-fatal — continue
    }
  }

  // ── Series milestone (if meeting is part of a series) ─────────────────────
  if (meeting.series_id) {
    try {
      const milestoneMessage = await anthropic.messages.create({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: `Based on this meeting summary, write EXACTLY 6 words that capture the most important milestone, decision, or insight from this meeting. Return ONLY the 6 words, nothing else.\n\nSummary: ${parsedAI.overall_summary}`,
          },
        ],
      });

      const milestoneText = milestoneMessage.content
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { type: string; text: string }) => b.text)
        .join('')
        .trim()
        .replace(/^["']|["']$/g, ''); // strip surrounding quotes

      if (milestoneText) {
        // Determine session number within series
        const { count: sessionCount } = await service
          .from('meetings')
          .select('id', { count: 'exact', head: true })
          .eq('series_id', meeting.series_id)
          .lte('started_at', meeting.started_at ?? new Date().toISOString());

        await service.from('series_milestones').insert({
          series_id:      meeting.series_id,
          meeting_id:     meetingId,
          milestone_text: milestoneText,
          milestone_type: 'info',
          session_number: sessionCount ?? 1,
        });
      }
    } catch (err) {
      console.error('[summary/route] Milestone generation failed (non-fatal):', err);
    }
  }

  return NextResponse.json(
    {
      summary:    insertedSummary,
      parsed:     parsedAI,
      message:    'Summary generated successfully.',
    },
    { status: 200 }
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}
