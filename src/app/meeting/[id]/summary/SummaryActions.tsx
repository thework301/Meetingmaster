'use client';

import { useState } from 'react';
import { FileDown, FileText, Send, Loader2, Sparkles } from 'lucide-react';

interface Props {
  meetingId: string;
  meetingTitle: string;
  isOrganiser: boolean;
  isAdmin: boolean;
  hasSummary: boolean;
}

export default function SummaryActions({
  meetingId,
  meetingTitle,
  isOrganiser,
  isAdmin,
  hasSummary,
}: Props) {
  const [generating, setGenerating] = useState(false);
  const [sending,    setSending]    = useState(false);
  const [genMessage, setGenMessage] = useState('');
  const [sendMessage, setSendMessage] = useState('');

  async function handleGenerate() {
    setGenerating(true);
    setGenMessage('');
    try {
      const res = await fetch(`/api/meetings/${meetingId}/summary`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) {
        setGenMessage(`Error: ${json.error ?? 'Failed to generate summary'}`);
      } else {
        setGenMessage('Summary generated successfully. Refresh to see it.');
      }
    } catch {
      setGenMessage('Network error — please try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSendAll() {
    setSending(true);
    setSendMessage('');
    try {
      const res = await fetch(`/api/meetings/${meetingId}/send-summary`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) {
        setSendMessage(`Error: ${json.error ?? 'Failed to send emails'}`);
      } else {
        setSendMessage(`Sent to ${json.sent_count} attendee${json.sent_count !== 1 ? 's' : ''}.`);
      }
    } catch {
      setSendMessage('Network error — please try again.');
    } finally {
      setSending(false);
    }
  }

  function downloadExport(format: 'docx' | 'pdf') {
    window.location.href = `/api/meetings/${meetingId}/export?format=${format}`;
  }

  const canSend = isOrganiser || isAdmin;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Meeting Actions</h3>

      <div className="flex flex-wrap gap-3">
        {/* Generate summary */}
        {canSend && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {generating ? 'Generating…' : hasSummary ? 'Regenerate Summary' : 'Generate Summary'}
          </button>
        )}

        {/* Export DOCX */}
        <button
          onClick={() => downloadExport('docx')}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
        >
          <FileText className="w-4 h-4 text-blue-600" />
          Export Word
        </button>

        {/* Export PDF */}
        <button
          onClick={() => downloadExport('pdf')}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
        >
          <FileDown className="w-4 h-4 text-red-500" />
          Export PDF
        </button>

        {/* Send to all */}
        {canSend && hasSummary && (
          <button
            onClick={handleSendAll}
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {sending ? 'Sending…' : 'Send to All'}
          </button>
        )}
      </div>

      {/* Feedback messages */}
      {genMessage && (
        <p
          className={`text-sm rounded-md px-3 py-2 ${
            genMessage.startsWith('Error')
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}
        >
          {genMessage}
        </p>
      )}
      {sendMessage && (
        <p
          className={`text-sm rounded-md px-3 py-2 ${
            sendMessage.startsWith('Error')
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}
        >
          {sendMessage}
        </p>
      )}

      {!canSend && (
        <p className="text-xs text-gray-400">
          Only the meeting organiser or an admin can generate summaries and send emails.
        </p>
      )}
    </div>
  );
}
