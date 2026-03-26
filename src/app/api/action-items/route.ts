import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const createSchema = z.object({
  meeting_id: z.string().uuid(),
  assigned_to_user_id: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional().nullable(),
  due_date: z.string().date().optional().nullable(),
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = createClient();

  // Verify meeting belongs to user's company
  const { data: meeting } = await supabase
    .from('meetings')
    .select('company_id, title')
    .eq('id', parsed.data.meeting_id)
    .single();

  if (!meeting || meeting.company_id !== user.company_id) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  const { data: actionItem, error: insertError } = await supabase
    .from('action_items')
    .insert({
      meeting_id: parsed.data.meeting_id,
      assigned_to_user_id: parsed.data.assigned_to_user_id,
      assigned_by_user_id: user.id,
      title: parsed.data.title,
      description: parsed.data.description || null,
      due_date: parsed.data.due_date || null,
      status: 'open',
      escalated: false,
    })
    .select('id')
    .single();

  if (insertError || !actionItem) {
    return NextResponse.json({ error: 'Failed to create action item' }, { status: 500 });
  }

  // Send email notification to assignee
  try {
    const { data: assignee } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('id', parsed.data.assigned_to_user_id)
      .single();

    if (assignee?.email && assignee.email !== user.email) {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL!,
        to: assignee.email,
        subject: `Action item assigned: ${parsed.data.title}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #1e293b;">Action Item Assigned</h2>
            <p>Hi ${assignee.full_name},</p>
            <p>${user.full_name} assigned you an action item in <strong>${meeting.title}</strong>:</p>
            <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 16px 0; border-radius: 4px;">
              <p style="font-weight: bold; margin: 0 0 8px 0;">${parsed.data.title}</p>
              ${parsed.data.description ? `<p style="color: #64748b; margin: 0 0 8px 0;">${parsed.data.description}</p>` : ''}
              ${parsed.data.due_date ? `<p style="color: #f59e0b; font-weight: 600; margin: 0;">Due: ${parsed.data.due_date}</p>` : ''}
            </div>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/actions" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">View Action Items</a>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 32px;">Meeting Master</p>
          </div>
        `,
      });

      await supabase.from('email_logs').insert({
        to_email: assignee.email,
        subject: `Action item assigned: ${parsed.data.title}`,
        type: 'action_assigned',
        meeting_id: parsed.data.meeting_id,
        status: 'sent',
      });
    }
  } catch {
    // Email failure should not break action item creation
  }

  return NextResponse.json({ id: actionItem.id }, { status: 201 });
}
