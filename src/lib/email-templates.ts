/**
 * Meeting Master – Email Templates
 *
 * Pure TypeScript functions that return HTML strings with full inline styling.
 * No external CSS dependencies. All templates share consistent MM branding.
 */

// ─── Shared brand tokens ──────────────────────────────────────────────────────

const BRAND = {
  primary:        '#4F46E5', // indigo-600
  primaryDark:    '#3730A3', // indigo-800
  primaryLight:   '#EEF2FF', // indigo-50
  success:        '#059669', // emerald-600
  successLight:   '#D1FAE5', // emerald-100
  warning:        '#D97706', // amber-600
  warningLight:   '#FEF3C7', // amber-100
  danger:         '#DC2626', // red-600
  dangerLight:    '#FEE2E2', // red-100
  textPrimary:    '#111827', // gray-900
  textSecondary:  '#6B7280', // gray-500
  textMuted:      '#9CA3AF', // gray-400
  border:         '#E5E7EB', // gray-200
  bgPage:         '#F9FAFB', // gray-50
  bgCard:         '#FFFFFF',
  fontFamily:     "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

// ─── Shared layout wrapper ────────────────────────────────────────────────────

function emailWrapper(content: string, preheader = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Meeting Master</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bgPage};font-family:${BRAND.fontFamily};-webkit-font-smoothing:antialiased;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.bgPage};">${preheader}</div>` : ''}
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${BRAND.bgPage};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND.primary} 0%,${BRAND.primaryDark} 100%);border-radius:12px 12px 0 0;padding:28px 36px 24px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td>
                    <span style="display:inline-flex;align-items:center;gap:8px;">
                      <span style="display:inline-block;width:32px;height:32px;background:rgba(255,255,255,0.2);border-radius:8px;text-align:center;line-height:32px;font-size:18px;">🗓</span>
                      <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Meeting Master</span>
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:${BRAND.bgCard};padding:32px 36px;border-left:1px solid ${BRAND.border};border-right:1px solid ${BRAND.border};">
              ${content}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#F3F4F6;border-radius:0 0 12px 12px;border:1px solid ${BRAND.border};border-top:none;padding:20px 36px;">
              <p style="margin:0;font-size:12px;color:${BRAND.textMuted};text-align:center;line-height:1.6;">
                You received this email because you are an attendee or member of Meeting Master.<br/>
                <a href="{{{unsubscribe_url}}}" style="color:${BRAND.primary};text-decoration:underline;">Unsubscribe</a>
                &nbsp;·&nbsp;
                <a href="https://meetingmaster.app/privacy" style="color:${BRAND.primary};text-decoration:underline;">Privacy Policy</a>
                &nbsp;·&nbsp;
                <a href="https://meetingmaster.app" style="color:${BRAND.primary};text-decoration:underline;">meetingmaster.app</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function h1(text: string): string {
  return `<h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:${BRAND.textPrimary};letter-spacing:-0.4px;">${escHtml(text)}</h1>`;
}

function h2(text: string): string {
  return `<h2 style="margin:0 0 12px;font-size:16px;font-weight:600;color:${BRAND.textPrimary};">${escHtml(text)}</h2>`;
}

function metaLine(icon: string, text: string): string {
  return `<p style="margin:4px 0;font-size:13px;color:${BRAND.textSecondary};">${icon}&nbsp;${escHtml(text)}</p>`;
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid ${BRAND.border};margin:24px 0;" />`;
}

function badge(
  label: string,
  bg: string,
  colour: string
): string {
  return `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;background:${bg};color:${colour};font-size:11px;font-weight:600;">${escHtml(label)}</span>`;
}

function actionItemCard(opts: {
  title: string;
  description?: string;
  dueDate?: string;
  status?: 'open' | 'done' | 'overdue';
  assigneeName?: string;
  highlight?: boolean;
}): string {
  const { title, description, dueDate, status = 'open', assigneeName, highlight = false } = opts;

  let statusBadge = '';
  if (status === 'done') {
    statusBadge = badge('Done', BRAND.successLight, BRAND.success);
  } else if (status === 'overdue') {
    statusBadge = badge('Overdue', BRAND.dangerLight, BRAND.danger);
  } else {
    statusBadge = badge('Open', BRAND.primaryLight, BRAND.primary);
  }

  const borderLeft = highlight
    ? `border-left:3px solid ${BRAND.primary};`
    : `border-left:3px solid ${BRAND.border};`;

  return `
<div style="padding:12px 16px;margin-bottom:10px;background:${highlight ? BRAND.primaryLight : '#FAFAFA'};border-radius:8px;${borderLeft}">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
    <tr>
      <td style="vertical-align:top;">
        <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:${BRAND.textPrimary};">${escHtml(title)}</p>
        ${description ? `<p style="margin:0 0 6px;font-size:13px;color:${BRAND.textSecondary};line-height:1.5;">${escHtml(description)}</p>` : ''}
        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td style="padding-right:8px;">${statusBadge}</td>
            ${assigneeName ? `<td style="padding-right:8px;"><span style="font-size:12px;color:${BRAND.textSecondary};">👤&nbsp;${escHtml(assigneeName)}</span></td>` : ''}
            ${dueDate ? `<td><span style="font-size:12px;color:${status === 'overdue' ? BRAND.danger : BRAND.textSecondary};">📅&nbsp;Due&nbsp;${escHtml(formatDate(dueDate))}</span></td>` : ''}
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;
}

function ctaButton(text: string, url: string): string {
  return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px auto;">
  <tr>
    <td style="border-radius:8px;background:${BRAND.primary};">
      <a href="${url}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
        ${escHtml(text)}
      </a>
    </td>
  </tr>
</table>`;
}

// ─── Template 1: Summary Email ────────────────────────────────────────────────

export interface SummaryEmailParams {
  recipientName: string;
  meetingTitle: string;
  date: string;
  summary: string;
  /** All action items (shown to present attendees) */
  actionItems: Array<{
    title: string;
    description?: string;
    dueDate?: string;
    status?: 'open' | 'done' | 'overdue';
    assigneeName?: string;
  }>;
  /** Recipient's own action items (highlighted) */
  myActionItems?: Array<{
    title: string;
    description?: string;
    dueDate?: string;
    status?: 'open' | 'done' | 'overdue';
  }>;
  absentee?: boolean;
}

export function summaryEmail(params: SummaryEmailParams): string {
  const {
    recipientName,
    meetingTitle,
    date,
    summary,
    actionItems,
    myActionItems = [],
    absentee = false,
  } = params;

  const greeting = absentee
    ? `Hi ${escHtml(recipientName)}, you missed a meeting`
    : `Hi ${escHtml(recipientName)}, here's your meeting summary`;

  const absenteeBanner = absentee
    ? `<div style="background:${BRAND.warningLight};border:1px solid #FCD34D;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
        <p style="margin:0;font-size:13px;font-weight:600;color:${BRAND.warning};">⚠️&nbsp;You were marked absent from this meeting</p>
        <p style="margin:4px 0 0;font-size:12px;color:#92400E;">Below is a summary of what you missed and any action items assigned to you.</p>
      </div>`
    : '';

  const myItemsSection =
    myActionItems.length > 0
      ? `${h2('Your Action Items')}
         ${myActionItems.map((item) => actionItemCard({ ...item, highlight: true })).join('')}
         ${divider()}`
      : '';

  const allItemsSection =
    actionItems.length > 0
      ? `${h2(absentee ? 'All Action Items from this Meeting' : 'All Action Items')}
         ${actionItems
           .map((item) =>
             actionItemCard({
               ...item,
               highlight: false,
             })
           )
           .join('')}`
      : `<p style="font-size:13px;color:${BRAND.textMuted};font-style:italic;">No action items were created for this meeting.</p>`;

  const body = `
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:${BRAND.primary};">
      ${absentee ? '📋 Meeting Summary' : '✅ Meeting Completed'}
    </p>
    ${h1(meetingTitle)}
    ${metaLine('📅', date)}
    ${divider()}
    ${absenteeBanner}

    ${h2('Meeting Summary')}
    <div style="background:#F8FAFC;border-radius:8px;border-left:3px solid ${BRAND.primary};padding:16px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:${BRAND.textPrimary};line-height:1.7;">${escHtml(summary)}</p>
    </div>

    ${divider()}
    ${myItemsSection}
    ${allItemsSection}

    ${ctaButton('View Full Summary', `https://meetingmaster.app/meeting/{{{meeting_id}}}/summary`)}

    <p style="margin:0;font-size:12px;color:${BRAND.textMuted};text-align:center;">${greeting}</p>
  `;

  return emailWrapper(body, `Meeting summary for ${meetingTitle} on ${date}`);
}

// ─── Template 2: Action Item Email ───────────────────────────────────────────

export interface ActionItemEmailParams {
  recipientName: string;
  itemTitle: string;
  description: string;
  dueDate: string;
  meetingTitle: string;
  assignedBy: string;
}

export function actionItemEmail(params: ActionItemEmailParams): string {
  const { recipientName, itemTitle, description, dueDate, meetingTitle, assignedBy } = params;

  const body = `
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:${BRAND.primary};">📌 New Action Item Assigned</p>
    ${h1('You have a new action item')}
    ${metaLine('👤', `Assigned by: ${assignedBy}`)}
    ${metaLine('📅', `From meeting: ${meetingTitle}`)}
    ${divider()}

    <div style="background:${BRAND.primaryLight};border-radius:10px;border:1px solid #C7D2FE;padding:20px 24px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:${BRAND.primaryDark};">${escHtml(itemTitle)}</p>
      ${description ? `<p style="margin:0 0 14px;font-size:14px;color:${BRAND.textSecondary};line-height:1.6;">${escHtml(description)}</p>` : ''}
      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td style="padding-right:12px;">
            ${badge('Open', BRAND.primaryLight, BRAND.primary)}
          </td>
          ${dueDate ? `<td><span style="font-size:13px;color:${BRAND.warning};font-weight:600;">📅 Due ${escHtml(formatDate(dueDate))}</span></td>` : ''}
        </tr>
      </table>
    </div>

    <p style="margin:0 0 6px;font-size:13px;color:${BRAND.textSecondary};">
      Hi <strong>${escHtml(recipientName)}</strong>, you have been assigned this action item from the meeting <em>${escHtml(meetingTitle)}</em>.
      Please complete it by the due date shown above.
    </p>

    ${ctaButton('Mark as Complete', `https://meetingmaster.app/action-items/{{{item_id}}}`)}
  `;

  return emailWrapper(body, `Action item assigned: ${itemTitle}`);
}

// ─── Template 3: Weekly Digest Email ─────────────────────────────────────────

export interface WeeklyDigestMeeting {
  title: string;
  date: string;
  attendeeCount: number;
  actionItemCount: number;
}

export interface WeeklyDigestActionItem {
  title: string;
  meetingTitle: string;
  dueDate?: string;
  status: 'open' | 'done' | 'overdue';
}

export interface WeeklyDigestEmailParams {
  recipientName: string;
  meetings: WeeklyDigestMeeting[];
  openActionItems: WeeklyDigestActionItem[];
  attendanceRate: number; // 0–100 %
}

export function weeklyDigestEmail(params: WeeklyDigestEmailParams): string {
  const { recipientName, meetings, openActionItems, attendanceRate } = params;

  const weekStart = getStartOfWeek();
  const weekLabel = `Week of ${weekStart}`;

  const attendanceColour =
    attendanceRate >= 80 ? BRAND.success : attendanceRate >= 50 ? BRAND.warning : BRAND.danger;

  const meetingRows = meetings.length > 0
    ? meetings
        .map(
          (m) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};">
          <p style="margin:0 0 2px;font-size:13px;font-weight:600;color:${BRAND.textPrimary};">${escHtml(m.title)}</p>
          <p style="margin:0;font-size:12px;color:${BRAND.textSecondary};">${escHtml(m.date)} · ${m.attendeeCount} attendees · ${m.actionItemCount} action items</p>
        </td>
      </tr>`
        )
        .join('')
    : `<tr><td style="padding:12px 0;"><p style="margin:0;font-size:13px;color:${BRAND.textMuted};font-style:italic;">No meetings this week.</p></td></tr>`;

  const openItems = openActionItems.filter((i) => i.status !== 'done');
  const overdueItems = openActionItems.filter((i) => i.status === 'overdue');

  const body = `
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:${BRAND.primary};">📊 Your Weekly Digest</p>
    ${h1(`Hi ${escHtml(recipientName)}, here's your week`)}
    ${metaLine('📅', weekLabel)}
    ${divider()}

    <!-- Stats row -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
      <tr>
        <td width="33%" style="padding:0 6px 0 0;">
          <div style="background:#F0FDF4;border-radius:10px;border:1px solid #BBF7D0;padding:16px;text-align:center;">
            <p style="margin:0 0 4px;font-size:28px;font-weight:700;color:${BRAND.success};">${meetings.length}</p>
            <p style="margin:0;font-size:11px;font-weight:600;color:#166534;text-transform:uppercase;letter-spacing:0.5px;">Meetings</p>
          </div>
        </td>
        <td width="33%" style="padding:0 3px;">
          <div style="background:${BRAND.primaryLight};border-radius:10px;border:1px solid #C7D2FE;padding:16px;text-align:center;">
            <p style="margin:0 0 4px;font-size:28px;font-weight:700;color:${BRAND.primary};">${openItems.length}</p>
            <p style="margin:0;font-size:11px;font-weight:600;color:${BRAND.primaryDark};text-transform:uppercase;letter-spacing:0.5px;">Open Tasks</p>
          </div>
        </td>
        <td width="33%" style="padding:0 0 0 6px;">
          <div style="background:#FFF7ED;border-radius:10px;border:1px solid #FED7AA;padding:16px;text-align:center;">
            <p style="margin:0 0 4px;font-size:28px;font-weight:700;color:${attendanceColour};">${attendanceRate}%</p>
            <p style="margin:0;font-size:11px;font-weight:600;color:#9A3412;text-transform:uppercase;letter-spacing:0.5px;">Attendance</p>
          </div>
        </td>
      </tr>
    </table>

    ${overdueItems.length > 0 ? `
    <div style="background:${BRAND.dangerLight};border:1px solid #FCA5A5;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;font-weight:600;color:${BRAND.danger};">⚠️&nbsp;You have ${overdueItems.length} overdue action item${overdueItems.length > 1 ? 's' : ''}</p>
    </div>` : ''}

    ${h2(`Meetings This Week`)}
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
      ${meetingRows}
    </table>

    ${openItems.length > 0 ? `
    ${divider()}
    ${h2('Open Action Items')}
    ${openItems
      .slice(0, 5)
      .map((item) =>
        actionItemCard({
          title:    item.title,
          dueDate:  item.dueDate,
          status:   item.status,
          highlight: item.status === 'overdue',
        })
      )
      .join('')}
    ${openItems.length > 5 ? `<p style="font-size:13px;color:${BRAND.textSecondary};margin:8px 0 0;">…and ${openItems.length - 5} more.</p>` : ''}
    ` : ''}

    ${ctaButton('Go to Dashboard', 'https://meetingmaster.app/dashboard')}
  `;

  return emailWrapper(body, `Your weekly digest – ${meetings.length} meetings, ${openItems.length} open tasks`);
}

// ─── Template 4: Overdue Escalation Email ────────────────────────────────────

export interface OverdueEscalationEmailParams {
  managerName: string;
  employeeName: string;
  itemTitle: string;
  daysOverdue: number;
  meetingTitle: string;
}

export function overdueEscalationEmail(params: OverdueEscalationEmailParams): string {
  const { managerName, employeeName, itemTitle, daysOverdue, meetingTitle } = params;

  const urgencyColour = daysOverdue >= 14 ? BRAND.danger : daysOverdue >= 7 ? BRAND.warning : BRAND.primary;
  const urgencyLabel  = daysOverdue >= 14 ? 'Critical' : daysOverdue >= 7 ? 'High' : 'Medium';

  const body = `
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:${BRAND.danger};">🔴 Action Item Overdue</p>
    ${h1(`Escalation Notice`)}
    ${metaLine('👤', `Employee: ${employeeName}`)}
    ${metaLine('📋', `From meeting: ${meetingTitle}`)}
    ${divider()}

    <div style="background:${BRAND.dangerLight};border-radius:10px;border:1px solid #FCA5A5;padding:20px 24px;margin-bottom:24px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:8px;">
        <tr>
          <td>
            <p style="margin:0;font-size:15px;font-weight:700;color:${BRAND.danger};">${escHtml(itemTitle)}</p>
          </td>
          <td align="right">
            ${badge(urgencyLabel, urgencyColour + '22', urgencyColour)}
          </td>
        </tr>
      </table>
      <p style="margin:0;font-size:26px;font-weight:800;color:${BRAND.danger};">${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue</p>
    </div>

    <p style="margin:0 0 16px;font-size:14px;color:${BRAND.textPrimary};line-height:1.7;">
      Hi <strong>${escHtml(managerName)}</strong>,<br/><br/>
      This is an automated escalation notice. <strong>${escHtml(employeeName)}</strong> has an overdue
      action item from the meeting <em>${escHtml(meetingTitle)}</em> that is now
      <strong style="color:${BRAND.danger};">${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} past due</strong>.
    </p>

    <div style="background:#FAFAFA;border-radius:8px;border:1px solid ${BRAND.border};padding:14px 16px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:${BRAND.textSecondary};text-transform:uppercase;letter-spacing:0.5px;">Action Required</p>
      <p style="margin:0;font-size:13px;color:${BRAND.textPrimary};">
        Please follow up with ${escHtml(employeeName)} to resolve or reassign this item.
        You can view and update the action item directly in Meeting Master.
      </p>
    </div>

    ${ctaButton('View Action Item', `https://meetingmaster.app/action-items/{{{item_id}}}`)}
  `;

  return emailWrapper(
    body,
    `Escalation: "${itemTitle}" is ${daysOverdue} days overdue – ${employeeName}`
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GB', {
      day:   'numeric',
      month: 'short',
      year:  'numeric',
    });
  } catch {
    return dateStr;
  }
}

function getStartOfWeek(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d.setDate(diff));
  return monday.toLocaleDateString('en-GB', {
    day:   'numeric',
    month: 'long',
    year:  'numeric',
  });
}
