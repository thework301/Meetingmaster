import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Get all users
  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, email, company_id');

  let emailsSent = 0;

  for (const user of users || []) {
    try {
      // Meetings this week
      const { data: meetings } = await supabase
        .from('meetings')
        .select('id, title, started_at, duration_seconds, status')
        .eq('company_id', user.company_id)
        .gte('started_at', sevenDaysAgo.toISOString())
        .eq('status', 'completed');

      // Open action items for this user
      const { data: actionItems } = await supabase
        .from('action_items')
        .select('id, title, status, due_date')
        .eq('assigned_to_user_id', user.id)
        .in('status', ['open', 'overdue']);

      // Attendance rate
      const { data: attendance } = await supabase
        .from('meeting_attendees')
        .select('is_present, meetings!inner(company_id, started_at)')
        .eq('user_id', user.id)
        .eq('meetings.company_id', user.company_id)
        .gte('meetings.started_at', sevenDaysAgo.toISOString());

      const totalMeetings = attendance?.length || 0;
      const presentCount = attendance?.filter(a => a.is_present).length || 0;
      const attendanceRate = totalMeetings > 0 ? Math.round((presentCount / totalMeetings) * 100) : 100;

      const overdueCount = actionItems?.filter(i => i.status === 'overdue').length || 0;

      const meetingRows = (meetings || []).map(m => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${m.title}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #64748b;">${m.started_at ? new Date(m.started_at).toLocaleDateString('en-GB') : '—'}</td>
        </tr>
      `).join('');

      const actionRows = (actionItems || []).slice(0, 5).map(a => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${a.title}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">
            <span style="color: ${a.status === 'overdue' ? '#dc2626' : '#2563eb'}; font-weight: 600;">${a.status}</span>
          </td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #64748b;">${a.due_date || '—'}</td>
        </tr>
      `).join('');

      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL!,
        to: user.email,
        subject: `Your weekly Meeting Master digest`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; color: #1e293b;">
            <div style="margin-bottom: 24px;">
              <h1 style="color: #3b82f6; margin: 0 0 4px 0; font-size: 24px;">Meeting Master</h1>
              <p style="color: #64748b; margin: 0;">Weekly digest for ${user.full_name}</p>
            </div>

            <div style="display: grid; gap: 16px; margin-bottom: 24px;">
              <div style="background: #eff6ff; padding: 16px; border-radius: 8px;">
                <p style="margin: 0; font-size: 14px; color: #3b82f6; font-weight: 600;">MEETINGS THIS WEEK</p>
                <p style="margin: 4px 0 0 0; font-size: 28px; font-weight: bold;">${meetings?.length || 0}</p>
              </div>
            </div>

            ${meetings && meetings.length > 0 ? `
              <h3 style="margin: 0 0 12px 0;">Meetings This Week</h3>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                <thead><tr style="background: #f8fafc;">
                  <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #64748b; text-transform: uppercase;">Title</th>
                  <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #64748b; text-transform: uppercase;">Date</th>
                </tr></thead>
                <tbody>${meetingRows}</tbody>
              </table>
            ` : ''}

            ${actionItems && actionItems.length > 0 ? `
              <h3 style="margin: 0 0 12px 0;">Your Open Actions ${overdueCount > 0 ? `<span style="color: #dc2626;">(${overdueCount} overdue)</span>` : ''}</h3>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                <thead><tr style="background: #f8fafc;">
                  <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #64748b; text-transform: uppercase;">Action</th>
                  <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #64748b; text-transform: uppercase;">Status</th>
                  <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #64748b; text-transform: uppercase;">Due</th>
                </tr></thead>
                <tbody>${actionRows}</tbody>
              </table>
            ` : '<p style="color: #22c55e;">All action items are complete!</p>'}

            <p style="margin-bottom: 8px;"><strong>Attendance rate this week:</strong> ${attendanceRate}%</p>

            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 8px;">Open Dashboard</a>

            <p style="color: #94a3b8; font-size: 12px; margin-top: 32px;">
              Meeting Master · <a href="${process.env.NEXT_PUBLIC_APP_URL}/privacy">Privacy Policy</a> · You receive this because you are a Meeting Master user.
            </p>
          </div>
        `,
      });

      await supabase.from('email_logs').insert({
        to_email: user.email,
        subject: 'Your weekly Meeting Master digest',
        type: 'weekly_digest',
        meeting_id: null,
        status: 'sent',
      });

      emailsSent++;
    } catch {
      // Continue to next user
    }
  }

  return NextResponse.json({ emails_sent: emailsSent });
}
