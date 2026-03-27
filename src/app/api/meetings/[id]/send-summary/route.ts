import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAuth, apiError } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { format, parseISO } from 'date-fns';
import { summaryEmail } from '@/lib/email-templates';

// ─── Local types ──────────────────────────────────────────────────────────────

interface ActionItemRow {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: 'open' | 'done' | 'overdue';
  assigned_to: unknown;
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

  // ── Fetch meeting ─────────────────────────────────────────────────────────
  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', meetingId)
    .single();

  if (meetingError || !meeting) return apiError('Meeting not found', 404);
  if (meeting.company_id !== user.company_id) return apiError('Access denied', 403);

  // ── Fetch summary ─────────────────────────────────────────────────────────
  const { data: summaryRow } = await supabase
    .from('summaries')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!summaryRow) {
    return apiError(
      'No summary found. Please generate a summary before sending.',
      422
    );
  }

  // ── Parse summary ─────────────────────────────────────────────────────────
  let parsedSummary: {
    overall_summary?: string;
    per_speaker?: Array<{ speaker_name: string; summary: string; key_points: string[] }>;
  } | null = null;

  try {
    parsedSummary = JSON.parse(summaryRow.ai_summary);
  } catch {
    // Plain text summary — use as-is
  }

  const summaryText = parsedSummary?.overall_summary ?? summaryRow.ai_summary ?? '';

  // ── Fetch attendees with user data ────────────────────────────────────────
  const { data: attendees } = await supabase
    .from('meeting_attendees')
    .select('*, users(id, full_name, email)')
    .eq('meeting_id', meetingId);

  if (!attendees || attendees.length === 0) {
    return apiError('No attendees found for this meeting.', 422);
  }

  // ── Fetch action items ────────────────────────────────────────────────────
  const { data: allActionItems } = await supabase
    .from('action_items')
    .select('*, assigned_to:users!action_items_assigned_to_user_id_fkey(id, full_name, email)')
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: true });

  const actionItems = allActionItems ?? [];

  // ── Meeting date string ───────────────────────────────────────────────────
  const meetingDate = meeting.started_at
    ? format(parseISO(meeting.started_at), 'PPP')
    : 'Unknown date';

  // ── Initialise Resend ─────────────────────────────────────────────────────
  if (!process.env.RESEND_API_KEY) {
    return apiError('Email service is not configured (RESEND_API_KEY missing).', 500);
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'Meeting Master <noreply@meetingmaster.app>';

  // ── Send emails ───────────────────────────────────────────────────────────
  const emailPromises: Promise<void>[] = [];
  const emailLogs: Array<{
    to_email: string;
    subject: string;
    type: string;
    meeting_id: string;
    status: string;
  }> = [];

  let sentCount = 0;

  for (const attendee of attendees) {
    const u = attendee.users as unknown as { id: string; full_name: string; email: string } | null;

    // Skip attendees with no email (guests without email address)
    const recipientEmail = u?.email ?? attendee.guest_email;
    const recipientName  = u?.full_name ?? attendee.guest_name ?? 'Attendee';

    if (!recipientEmail) continue;

    // Get this attendee's specific action items
    const myActionItems = (actionItems as ActionItemRow[]).filter((item: ActionItemRow) => {
      const assigned = item.assigned_to as { id: string } | null;
      return assigned?.id === u?.id;
    });

    const formattedActionItems = myActionItems.map((item: ActionItemRow) => ({
      title:       item.title,
      description: item.description ?? '',
      dueDate:     item.due_date ?? '',
      status:      item.status,
    }));

    // All action items (for context in the summary)
    const allFormattedActionItems = (actionItems as ActionItemRow[]).map((item: ActionItemRow) => {
      const assigned = item.assigned_to as { full_name: string } | null;
      return {
        title:        item.title,
        description:  item.description ?? '',
        dueDate:      item.due_date ?? '',
        status:       item.status,
        assigneeName: assigned?.full_name ?? 'Unassigned',
      };
    });

    const isAbsent = !attendee.is_present;
    const subject  = isAbsent
      ? `You missed: ${meeting.title} – Summary & Your Action Items`
      : `Meeting Summary: ${meeting.title}`;

    const htmlBody = summaryEmail({
      recipientName,
      meetingTitle:     meeting.title,
      date:             meetingDate,
      summary:          summaryText,
      actionItems:      allFormattedActionItems,
      myActionItems:    formattedActionItems,
      absentee:         isAbsent,
    });

    emailPromises.push(
      (async () => {
        try {
          await resend.emails.send({
            from:    fromEmail,
            to:      recipientEmail,
            subject,
            html:    htmlBody,
          });

          emailLogs.push({
            to_email:   recipientEmail,
            subject,
            type:       isAbsent ? 'absent_summary' : 'meeting_summary',
            meeting_id: meetingId,
            status:     'sent',
          });

          sentCount++;
        } catch (err) {
          console.error(`[send-summary] Failed to send to ${recipientEmail}:`, err);
          emailLogs.push({
            to_email:   recipientEmail,
            subject,
            type:       isAbsent ? 'absent_summary' : 'meeting_summary',
            meeting_id: meetingId,
            status:     'failed',
          });
        }
      })()
    );
  }

  // ── Await all email sends ─────────────────────────────────────────────────
  await Promise.allSettled(emailPromises);

  // ── Log emails in DB ──────────────────────────────────────────────────────
  if (emailLogs.length > 0) {
    const { error: logError } = await service.from('email_logs').insert(
      emailLogs.map((log) => ({
        ...log,
        sent_at: new Date().toISOString(),
      }))
    );

    if (logError) {
      console.error('[send-summary] Failed to write email_logs:', logError);
      // Non-fatal — continue
    }
  }

  // ── Update summaries.sent_at ──────────────────────────────────────────────
  if (sentCount > 0) {
    await service
      .from('summaries')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', summaryRow.id);
  }

  return NextResponse.json(
    {
      sent_count:   sentCount,
      failed_count: emailLogs.filter((l) => l.status === 'failed').length,
      message:      `Summary sent to ${sentCount} attendee${sentCount !== 1 ? 's' : ''}.`,
    },
    { status: 200 }
  );
}
