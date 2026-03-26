import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  // Verify cron secret
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  // 1. Mark overdue items
  await supabase
    .from('action_items')
    .update({ status: 'overdue' })
    .eq('status', 'open')
    .lt('due_date', todayStr);

  // 2. Send due-tomorrow reminders
  const { data: dueTomorrow } = await supabase
    .from('action_items')
    .select(`
      id, title, description, due_date,
      assigned_to: users!action_items_assigned_to_user_id_fkey(full_name, email),
      meetings(title)
    `)
    .eq('status', 'open')
    .eq('due_date', tomorrowStr);

  for (const item of dueTomorrow || []) {
    const assignee = item.assigned_to as { full_name: string; email: string } | null;
    if (!assignee?.email) continue;

    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL!,
        to: assignee.email,
        subject: `Reminder: "${item.title}" is due tomorrow`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #1e293b;">Action Item Reminder</h2>
            <p>Hi ${assignee.full_name},</p>
            <p>This is a reminder that the following action item is due tomorrow:</p>
            <div style="background: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px; margin: 16px 0; border-radius: 4px;">
              <p style="font-weight: bold; margin: 0 0 8px 0;">${item.title}</p>
              ${item.description ? `<p style="color: #64748b; margin: 0 0 8px 0;">${item.description}</p>` : ''}
              <p style="color: #64748b; margin: 0; font-size: 14px;">From: ${(item.meetings as {title: string} | null)?.title || 'Unknown meeting'}</p>
              <p style="color: #f59e0b; margin: 4px 0 0 0; font-size: 14px; font-weight: 600;">Due: ${item.due_date}</p>
            </div>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/actions" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">View Action Items</a>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 32px;">Meeting Master · <a href="${process.env.NEXT_PUBLIC_APP_URL}/privacy">Privacy Policy</a></p>
          </div>
        `,
      });

      await supabase.from('email_logs').insert({
        to_email: assignee.email,
        subject: `Reminder: "${item.title}" is due tomorrow`,
        type: 'action_reminder',
        meeting_id: null,
        status: 'sent',
      });
    } catch {
      // Continue sending to other recipients
    }
  }

  // 3. Escalate items overdue by 48h
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const twoDaysAgoStr = twoDaysAgo.toISOString().split('T')[0];

  const { data: escalateItems } = await supabase
    .from('action_items')
    .select(`
      id, title, due_date,
      assigned_to: users!action_items_assigned_to_user_id_fkey(full_name, email, company_id),
      meetings(title)
    `)
    .eq('status', 'overdue')
    .eq('escalated', false)
    .lte('due_date', twoDaysAgoStr);

  for (const item of escalateItems || []) {
    const assignee = item.assigned_to as { full_name: string; email: string; company_id: string } | null;
    if (!assignee) continue;

    // Find admin (manager) in same company
    const { data: admins } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('company_id', assignee.company_id)
      .eq('role', 'admin')
      .limit(1);

    const manager = admins?.[0];
    if (!manager?.email) continue;

    const daysOverdue = Math.floor((today.getTime() - new Date(item.due_date!).getTime()) / (1000 * 60 * 60 * 24));

    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL!,
        to: manager.email,
        subject: `Escalation: Action item overdue by ${daysOverdue} days`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #dc2626;">Action Item Escalation</h2>
            <p>Hi ${manager.full_name},</p>
            <p>An action item assigned to <strong>${assignee.full_name}</strong> is now <strong>${daysOverdue} days overdue</strong>:</p>
            <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 16px 0; border-radius: 4px;">
              <p style="font-weight: bold; margin: 0 0 8px 0; color: #7f1d1d;">${item.title}</p>
              <p style="color: #991b1b; margin: 0; font-size: 14px;">Was due: ${item.due_date}</p>
            </div>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin" style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">View in Admin Panel</a>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 32px;">Meeting Master · Automated escalation</p>
          </div>
        `,
      });

      // Mark as escalated
      await supabase
        .from('action_items')
        .update({ escalated: true, escalated_at: new Date().toISOString() })
        .eq('id', item.id);

      await supabase.from('email_logs').insert({
        to_email: manager.email,
        subject: `Escalation: Action item overdue by ${daysOverdue} days`,
        type: 'escalation',
        meeting_id: null,
        status: 'sent',
      });
    } catch {
      // Continue
    }
  }

  return NextResponse.json({
    reminders_sent: dueTomorrow?.length || 0,
    escalations_sent: escalateItems?.length || 0,
  });
}
