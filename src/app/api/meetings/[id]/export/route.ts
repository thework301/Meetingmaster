import { NextRequest, NextResponse } from 'next/server';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
  convertInchesToTwip,
} from 'docx';
import jsPDF from 'jspdf';
import { requireAuth, apiError } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { format, parseISO } from 'date-fns';

// ─── Speaker colours (hex) for transcript colour-coding ──────────────────────
const SPEAKER_COLOURS_HEX = [
  'DBEAFE', // blue-100
  'D1FAE5', // emerald-100
  'FEF3C7', // amber-100
  'FEE2E2', // red-100
  'EDE9FE', // violet-100
  'FCE7F3', // pink-100
  'CFFAFE', // cyan-100
  'ECFCCB', // lime-100
];

const SPEAKER_TEXT_COLOURS_HEX = [
  '1E40AF', // blue-800
  '065F46', // emerald-800
  '92400E', // amber-800
  '991B1B', // red-800
  '5B21B6', // violet-800
  '9D174D', // pink-800
  '155E75', // cyan-800
  '3F6212', // lime-800
];

// ─── Plan check ───────────────────────────────────────────────────────────────
const EXPORT_PLANS = new Set(['pro', 'team', 'enterprise']);

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const { user, error: authError } = await requireAuth(request);
  if (authError) return authError;

  // ── Plan gate ─────────────────────────────────────────────────────────────
  if (!EXPORT_PLANS.has(user.plan)) {
    return apiError(
      'Export is available on Pro, Team, and Enterprise plans. Please upgrade to use this feature.',
      403
    );
  }

  // ── Query param ───────────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const exportFormat = searchParams.get('format');

  if (exportFormat !== 'docx' && exportFormat !== 'pdf') {
    return apiError('Invalid format. Use format=docx or format=pdf', 400);
  }

  const meetingId = params.id;
  const supabase  = createClient();

  // ── Fetch meeting ─────────────────────────────────────────────────────────
  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', meetingId)
    .single();

  if (meetingError || !meeting) return apiError('Meeting not found', 404);

  if (meeting.company_id !== user.company_id) return apiError('Access denied', 403);

  // ── Parallel data fetch ───────────────────────────────────────────────────
  const [
    { data: attendees },
    { data: summaryRow },
    { data: actionItems },
    { data: agendaItems },
    { data: transcript },
    { data: speakerSegments },
  ] = await Promise.all([
    supabase
      .from('meeting_attendees')
      .select('*, users(id, full_name, email)')
      .eq('meeting_id', meetingId),
    supabase
      .from('summaries')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('action_items')
      .select('*, assigned_to:users!action_items_assigned_to_user_id_fkey(id, full_name, email)')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: true }),
    supabase
      .from('agenda_items')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('position_order', { ascending: true }),
    supabase
      .from('transcripts')
      .select('id, full_text')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('speaker_segments')
      .select('speaker_label, speaker_name, start_time_seconds, text_content')
      .order('start_time_seconds', { ascending: true }),
  ]);

  // ── Parse summary ─────────────────────────────────────────────────────────
  let parsedSummary: {
    overall_summary?: string;
    per_speaker?: Array<{
      speaker_label: string;
      speaker_name: string;
      summary: string;
      key_points: string[];
    }>;
    agenda_coverage?: { completed_items: string[]; uncovered_items: string[] };
    meeting_quality_score?: number;
  } | null = null;

  if (summaryRow?.ai_summary) {
    try {
      parsedSummary = JSON.parse(summaryRow.ai_summary);
    } catch {
      // Stored as plain text — ignore structured fields
    }
  }

  // ── Build speaker index for colour mapping ────────────────────────────────
  const speakerLabelIndex = new Map<string, number>();
  (speakerSegments ?? []).forEach((seg: { speaker_label: string }) => {
    const key = seg.speaker_label;
    if (!speakerLabelIndex.has(key)) {
      speakerLabelIndex.set(key, speakerLabelIndex.size);
    }
  });

  const safeTitle = meeting.title.replace(/[^\w\s-]/g, '').trim() || 'meeting';
  const dateStr   = meeting.started_at
    ? format(parseISO(meeting.started_at), 'yyyy-MM-dd')
    : format(new Date(), 'yyyy-MM-dd');
  const filename = `${safeTitle}-${dateStr}`;

  // ─────────────────────────────────────────────────────────────────────────
  //  DOCX export
  // ─────────────────────────────────────────────────────────────────────────
  if (exportFormat === 'docx') {
    const doc = buildDocx({
      meeting,
      attendees:      attendees ?? [],
      summaryRow,
      parsedSummary,
      actionItems:    actionItems ?? [],
      agendaItems:    agendaItems ?? [],
      transcript:     transcript ?? null,
      speakerSegments: speakerSegments ?? [],
      speakerLabelIndex,
    });

    const buffer = await Packer.toBuffer(doc);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}.docx"`,
        'Content-Length':      buffer.byteLength.toString(),
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  PDF export
  // ─────────────────────────────────────────────────────────────────────────
  const pdfBytes = buildPdf({
    meeting,
    attendees:      attendees ?? [],
    summaryRow,
    parsedSummary,
    actionItems:    actionItems ?? [],
    agendaItems:    agendaItems ?? [],
    transcript:     transcript ?? null,
    speakerSegments: speakerSegments ?? [],
    speakerLabelIndex,
  });

  return new NextResponse(pdfBytes, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}.pdf"`,
      'Content-Length':      pdfBytes.byteLength.toString(),
    },
  });
}

// ─── DOCX builder ─────────────────────────────────────────────────────────────

function buildDocx(opts: ExportOpts): Document {
  const {
    meeting,
    attendees,
    summaryRow,
    parsedSummary,
    actionItems,
    agendaItems,
    transcript,
    speakerSegments,
    speakerLabelIndex,
  } = opts;

  const children: Paragraph[] = [];

  // ── Title ─────────────────────────────────────────────────────────────────
  children.push(
    new Paragraph({
      text:    meeting.title,
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: meeting.started_at
            ? format(parseISO(meeting.started_at), 'PPPP · p')
            : 'Date unknown',
          color: '6B7280',
          size:  22,
        }),
      ],
      spacing: { after: 400 },
    })
  );

  // ── Attendees ─────────────────────────────────────────────────────────────
  children.push(
    new Paragraph({
      text:    'Attendees',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 200 },
    })
  );

  attendees.forEach((a) => {
    const u     = a.users as unknown as { full_name: string; email: string } | null;
    const name  = u?.full_name ?? a.guest_name ?? 'Unknown';
    const email = u?.email ?? a.guest_email ?? '';
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text:  `${a.is_present ? '✓' : '✗'} `,
            bold:  true,
            color: a.is_present ? '065F46' : '991B1B',
          }),
          new TextRun({ text: name }),
          email
            ? new TextRun({ text: ` <${email}>`, color: '6B7280', italics: true })
            : new TextRun({ text: '' }),
          a.is_present
            ? new TextRun({ text: '' })
            : new TextRun({ text: '  (absent)', color: '92400E', italics: true }),
        ],
        spacing: { after: 80 },
      })
    );
  });

  // ── Agenda ────────────────────────────────────────────────────────────────
  if (agendaItems.length > 0) {
    children.push(
      new Paragraph({
        text:    'Agenda',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      })
    );

    agendaItems.forEach((item, i) => {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text:  `${item.completed ? '☑' : '☐'} `,
              color: item.completed ? '065F46' : '6B7280',
            }),
            new TextRun({
              text:          `${i + 1}. ${item.title}`,
              bold:          item.completed,
              strike:        false,
            }),
            new TextRun({
              text:  ` (${item.duration_minutes}m)`,
              color: '9CA3AF',
              size:  18,
            }),
          ],
          spacing: { after: 80 },
        })
      );
    });
  }

  // ── AI Summary ────────────────────────────────────────────────────────────
  children.push(
    new Paragraph({
      text:    'AI Meeting Summary',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    })
  );

  if (parsedSummary?.overall_summary) {
    children.push(
      new Paragraph({
        text:    parsedSummary.overall_summary,
        spacing: { after: 200 },
      })
    );
  } else if (summaryRow?.ai_summary) {
    children.push(
      new Paragraph({
        text:    summaryRow.ai_summary,
        spacing: { after: 200 },
      })
    );
  } else {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'No summary generated yet.', italics: true, color: '6B7280' })],
        spacing:  { after: 200 },
      })
    );
  }

  // ── Per-speaker summaries ─────────────────────────────────────────────────
  if (parsedSummary?.per_speaker && parsedSummary.per_speaker.length > 0) {
    children.push(
      new Paragraph({
        text:    'Speaker Summaries',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 200 },
      })
    );

    parsedSummary.per_speaker.forEach((sp: { speaker_name: string; summary: string; key_points: string[] }) => {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: sp.speaker_name, bold: true, size: 22 })],
          spacing:  { before: 200, after: 80 },
        }),
        new Paragraph({
          children: [new TextRun({ text: sp.summary, italics: true })],
          spacing:  { after: 80 },
        })
      );

      sp.key_points.forEach((point: string) => {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: '• ', bold: true }),
              new TextRun({ text: point }),
            ],
            indent:  { left: convertInchesToTwip(0.3) },
            spacing: { after: 60 },
          })
        );
      });
    });
  }

  // ── Action items table ────────────────────────────────────────────────────
  children.push(
    new Paragraph({
      text:    'Action Items',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    })
  );

  if (actionItems.length > 0) {
    const headerRow = new TableRow({
      children: [
        tableHeaderCell('Title'),
        tableHeaderCell('Assignee'),
        tableHeaderCell('Due Date'),
        tableHeaderCell('Status'),
      ],
      tableHeader: true,
    });

    const dataRows = actionItems.map((item) => {
      const assignee = item.assigned_to as unknown as { full_name: string } | null;
      const isOverdue =
        item.status === 'overdue' ||
        (item.status === 'open' && item.due_date !== null && new Date(item.due_date) < new Date());

      return new TableRow({
        children: [
          tableCell(item.title),
          tableCell(assignee?.full_name ?? '—'),
          tableCell(item.due_date ? format(parseISO(item.due_date), 'PP') : '—'),
          tableCell(
            isOverdue ? 'Overdue' : item.status.charAt(0).toUpperCase() + item.status.slice(1),
            isOverdue ? 'FF0000' : item.status === 'done' ? '065F46' : '1D4ED8'
          ),
        ],
      });
    });

    const table = new Table({
      rows:  [headerRow, ...dataRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
    });

    // Tables can't go directly in children — wrap with a cast
    (children as unknown[]).push(table);
  } else {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'No action items for this meeting.', italics: true, color: '6B7280' })],
      })
    );
  }

  // ── Full transcript ───────────────────────────────────────────────────────
  if (transcript?.full_text) {
    children.push(
      new Paragraph({
        text:    'Full Transcript',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 500, after: 200 },
      })
    );

    if (speakerSegments.length > 0) {
      // Colour-coded by speaker
      speakerSegments.forEach((seg) => {
        const idx      = speakerLabelIndex.get(seg.speaker_label) ?? 0;
        const bgColour = SPEAKER_COLOURS_HEX[idx % SPEAKER_COLOURS_HEX.length];
        const txColour = SPEAKER_TEXT_COLOURS_HEX[idx % SPEAKER_TEXT_COLOURS_HEX.length];
        const name     = seg.speaker_name ?? seg.speaker_label;
        const time     = formatTime(seg.start_time_seconds);

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text:  `[${time}] ${name}: `,
                bold:  true,
                color: txColour,
              }),
              new TextRun({ text: seg.text_content }),
            ],
            shading: {
              type:  ShadingType.CLEAR,
              fill:  bgColour,
              color: bgColour,
            },
            spacing: { after: 100 },
          })
        );
      });
    } else {
      // Plain transcript
      const lines = transcript.full_text.split('\n');
      lines.forEach((line) => {
        children.push(
          new Paragraph({
            text:    line,
            spacing: { after: 80 },
            style:   'Normal',
          })
        );
      });
    }
  }

  return new Document({
    creator:     'Meeting Master',
    title:       meeting.title,
    description: 'Meeting summary exported from Meeting Master',
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });
}

// ─── PDF builder ──────────────────────────────────────────────────────────────

function buildPdf(opts: ExportOpts): Uint8Array {
  const {
    meeting,
    attendees,
    summaryRow,
    parsedSummary,
    actionItems,
    agendaItems,
    transcript,
    speakerSegments,
    speakerLabelIndex,
  } = opts;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW   = doc.internal.pageSize.getWidth();
  const pageH   = doc.internal.pageSize.getHeight();
  const margin  = 56;
  const colW    = pageW - margin * 2;
  let y = margin;

  // ── Helper: add new page if needed ────────────────────────────────────────
  function checkPage(needed = 20) {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  }

  function sectionHeading(text: string) {
    checkPage(30);
    y += 14;
    doc.setFillColor(79, 70, 229); // indigo-600
    doc.rect(margin, y, colW, 22, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(text, margin + 8, y + 14);
    y += 30;
    doc.setTextColor(17, 24, 39); // gray-900
  }

  function bodyText(text: string, indent = 0, colour: [number, number, number] = [55, 65, 81]) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...colour);
    const lines = doc.splitTextToSize(text, colW - indent);
    lines.forEach((line: string) => {
      checkPage(14);
      doc.text(line, margin + indent, y);
      y += 13;
    });
  }

  function boldText(text: string, size = 9) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    doc.setTextColor(17, 24, 39);
  }

  // ── Cover / title ─────────────────────────────────────────────────────────
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, pageW, 90, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  const titleLines = doc.splitTextToSize(meeting.title, colW);
  titleLines.forEach((line: string) => {
    doc.text(line, margin, y + 18);
    y += 26;
  });
  y = 100;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text(
    meeting.started_at ? format(parseISO(meeting.started_at), 'PPPP · p') : 'Date unknown',
    margin,
    y
  );
  doc.text('Generated by Meeting Master', pageW - margin, y, { align: 'right' });
  y += 30;

  // ── Attendees ─────────────────────────────────────────────────────────────
  sectionHeading('Attendees');

  attendees.forEach((a) => {
    const u    = a.users as unknown as { full_name: string; email: string } | null;
    const name = u?.full_name ?? a.guest_name ?? 'Unknown';
    checkPage(14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (a.is_present) {
      doc.setTextColor(6, 95, 70);
      doc.text('✓', margin, y);
    } else {
      doc.setTextColor(153, 27, 27);
      doc.text('✗', margin, y);
    }
    doc.setTextColor(17, 24, 39);
    doc.text(name + (a.is_present ? '' : ' (absent)'), margin + 14, y);
    y += 14;
  });
  y += 6;

  // ── Agenda ────────────────────────────────────────────────────────────────
  if (agendaItems.length > 0) {
    sectionHeading('Agenda');
    agendaItems.forEach((item, i) => {
      checkPage(14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      if (item.completed) {
        doc.setTextColor(6, 95, 70);
        doc.text('☑', margin, y);
      } else {
        doc.setTextColor(107, 114, 128);
        doc.text('☐', margin, y);
      }
      doc.setTextColor(17, 24, 39);
      doc.text(`${i + 1}. ${item.title} (${item.duration_minutes}m)`, margin + 14, y);
      y += 14;
    });
    y += 6;
  }

  // ── AI Summary ────────────────────────────────────────────────────────────
  sectionHeading('AI Meeting Summary');

  const summaryText =
    parsedSummary?.overall_summary ??
    summaryRow?.ai_summary ??
    'No summary generated yet.';

  bodyText(summaryText);
  y += 8;

  // Per-speaker
  if (parsedSummary?.per_speaker && parsedSummary.per_speaker.length > 0) {
    checkPage(20);
    boldText('Speaker Summaries', 10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Speaker Summaries', margin, y);
    y += 16;

    parsedSummary.per_speaker.forEach((sp: { speaker_name: string; summary: string; key_points: string[] }) => {
      checkPage(30);
      boldText(sp.speaker_name);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(sp.speaker_name, margin, y);
      y += 13;

      bodyText(sp.summary, 10, [75, 85, 99]);

      sp.key_points.forEach((pt: string) => {
        bodyText(`• ${pt}`, 16);
      });
      y += 4;
    });
  }

  // ── Action items ──────────────────────────────────────────────────────────
  sectionHeading('Action Items');

  if (actionItems.length > 0) {
    // Table header
    checkPage(24);
    const colWidths = [colW * 0.42, colW * 0.22, colW * 0.18, colW * 0.18];
    const headers   = ['Title', 'Assignee', 'Due Date', 'Status'];

    doc.setFillColor(238, 242, 255);
    doc.rect(margin, y - 12, colW, 20, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(55, 48, 163);
    let cx = margin + 4;
    headers.forEach((h, i) => {
      doc.text(h, cx, y);
      cx += colWidths[i];
    });
    y += 10;

    // Draw line
    doc.setDrawColor(199, 210, 254);
    doc.line(margin, y, margin + colW, y);
    y += 8;

    actionItems.forEach((item, rowIdx) => {
      const assignee = item.assigned_to as unknown as { full_name: string } | null;
      const isOverdue =
        item.status === 'overdue' ||
        (item.status === 'open' && item.due_date !== null && new Date(item.due_date) < new Date());
      const statusLabel = isOverdue ? 'Overdue' : item.status.charAt(0).toUpperCase() + item.status.slice(1);

      const titleLines = doc.splitTextToSize(item.title, colWidths[0] - 8);
      const rowH       = Math.max(titleLines.length * 13 + 8, 20);
      checkPage(rowH);

      if (rowIdx % 2 === 0) {
        doc.setFillColor(249, 250, 251);
        doc.rect(margin, y - 10, colW, rowH, 'F');
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(17, 24, 39);

      cx = margin + 4;

      // Title
      titleLines.forEach((line: string, li: number) => {
        doc.text(line, cx, y + li * 13);
      });
      cx += colWidths[0];

      // Assignee
      doc.text(assignee?.full_name ?? '—', cx, y);
      cx += colWidths[1];

      // Due date
      doc.text(item.due_date ? format(parseISO(item.due_date), 'PP') : '—', cx, y);
      cx += colWidths[2];

      // Status (coloured)
      if (isOverdue) doc.setTextColor(153, 27, 27);
      else if (item.status === 'done') doc.setTextColor(6, 95, 70);
      else doc.setTextColor(29, 78, 216);

      doc.setFont('helvetica', 'bold');
      doc.text(statusLabel, cx, y);
      doc.setTextColor(17, 24, 39);

      y += rowH + 2;
    });
  } else {
    bodyText('No action items for this meeting.', 0, [107, 114, 128]);
  }
  y += 8;

  // ── Transcript ────────────────────────────────────────────────────────────
  if (transcript?.full_text) {
    sectionHeading('Full Transcript');

    if (speakerSegments.length > 0) {
      speakerSegments.forEach((seg) => {
        const idx  = speakerLabelIndex.get(seg.speaker_label) ?? 0;
        const name = seg.speaker_name ?? seg.speaker_label;
        const time = formatTime(seg.start_time_seconds);

        checkPage(24);

        // Speaker header row
        const bgHex = SPEAKER_COLOURS_HEX[idx % SPEAKER_COLOURS_HEX.length];
        const bgR   = parseInt(bgHex.slice(0, 2), 16);
        const bgG   = parseInt(bgHex.slice(2, 4), 16);
        const bgB   = parseInt(bgHex.slice(4, 6), 16);
        const txHex = SPEAKER_TEXT_COLOURS_HEX[idx % SPEAKER_TEXT_COLOURS_HEX.length];
        const txR   = parseInt(txHex.slice(0, 2), 16);
        const txG   = parseInt(txHex.slice(2, 4), 16);
        const txB   = parseInt(txHex.slice(4, 6), 16);

        doc.setFillColor(bgR, bgG, bgB);
        doc.rect(margin, y - 10, colW, 18, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(txR, txG, txB);
        doc.text(`[${time}] ${name}`, margin + 4, y);
        y += 12;

        bodyText(seg.text_content, 8);
        y += 4;
      });
    } else {
      // Plain text
      bodyText(transcript.full_text, 0, [55, 65, 81]);
    }
  }

  // ── Footer on last page ───────────────────────────────────────────────────
  const totalPages = (doc.internal as unknown as { getNumberOfPages(): number }).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(156, 163, 175);
    doc.text(
      `Meeting Master · ${meeting.title} · Page ${i} of ${totalPages}`,
      pageW / 2,
      pageH - 24,
      { align: 'center' }
    );
  }

  return doc.output('arraybuffer') as unknown as Uint8Array;
}

// ─── Shared types ─────────────────────────────────────────────────────────────

interface ExportOpts {
  meeting: {
    id: string;
    title: string;
    started_at: string | null;
    ended_at: string | null;
    duration_seconds: number | null;
    organiser_id: string;
    company_id: string;
    series_id: string | null;
    meeting_type: string;
    status: string;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attendees: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summaryRow: any | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parsedSummary: any | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actionItems: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agendaItems: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transcript: { id: string; full_text: string } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  speakerSegments: any[];
  speakerLabelIndex: Map<string, number>;
}

// ─── DOCX table helpers ───────────────────────────────────────────────────────

function tableHeaderCell(text: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: '3730A3', size: 18 })],
      }),
    ],
    shading: { type: ShadingType.CLEAR, fill: 'EEF2FF', color: 'EEF2FF' },
    borders: tableCellBorders(),
  });
}

function tableCell(text: string, colour?: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            color: colour ?? '111827',
            bold:  !!colour,
            size:  18,
          }),
        ],
      }),
    ],
    borders: tableCellBorders(),
  });
}

function tableCellBorders() {
  return {
    top:    { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
    left:   { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
    right:  { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
  };
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}
