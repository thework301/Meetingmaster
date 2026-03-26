'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Link2, Loader2 } from 'lucide-react';

declare global {
  interface Window {
    Office: {
      initialize: (reason: unknown) => void;
      context: {
        mailbox: {
          item: {
            subject: { setAsync: (s: string, cb: (r: unknown) => void) => void };
            body: {
              setAsync: (content: string, options: { coercionType: string }, cb: (r: unknown) => void) => void;
              getAsync: (options: { coercionType: string }, cb: (r: { value: string }) => void) => void;
            };
          };
          userProfile: { emailAddress: string; displayName: string };
        };
      };
    };
  }
}

type AddinState = 'loading' | 'ready' | 'creating' | 'created' | 'error';

export default function OutlookAddinPage() {
  const [state, setState] = useState<AddinState>('loading');
  const [title, setTitle] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [error, setError] = useState('');
  const [officeReady, setOfficeReady] = useState(false);

  useEffect(() => {
    // Load Office.js
    const script = document.createElement('script');
    script.src = 'https://appsforoffice.microsoft.com/lib/1.1/hosted/office.js';
    script.onload = () => {
      if (window.Office) {
        window.Office.initialize = () => {
          setOfficeReady(true);
          // Pre-fill with meeting subject if available
          try {
            window.Office.context.mailbox.item.subject.setAsync('', () => {});
          } catch {
            // Not composing a new message
          }
        };
      }
      setState('ready');
    };
    script.onerror = () => setState('ready'); // Work without Office.js for testing
    document.head.appendChild(script);
  }, []);

  const handleCreateMeeting = async () => {
    if (!title.trim()) {
      setError('Please enter a meeting title');
      return;
    }

    setState('creating');
    setError('');

    try {
      // Get current user from Office context or fallback
      const userEmail = officeReady
        ? window.Office?.context?.mailbox?.userProfile?.emailAddress
        : undefined;

      // Create meeting via API
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          meeting_type: 'team_sync',
          agenda_items: [],
          attendees: [],
          is_series: false,
          settings: {
            transcription_enabled: true,
            auto_summary_enabled: true,
            send_absent_email: true,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create meeting');
      }

      const { id } = await res.json();
      const url = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/meeting/${id}/live`;
      setMeetingUrl(url);

      // Insert link into Outlook email body
      if (officeReady && window.Office) {
        const insertText = `\n\n📅 Meeting Master Session\nJoin here: ${url}\n\nThis meeting is being managed with Meeting Master — AI-powered meeting notes and action tracking.`;

        window.Office.context.mailbox.item.body.getAsync(
          { coercionType: 'text' },
          (result: { value: string }) => {
            const newBody = result.value + insertText;
            window.Office.context.mailbox.item.body.setAsync(
              newBody,
              { coercionType: 'text' },
              () => {}
            );
          }
        );
      }

      setState('created');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setState('ready');
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(meetingUrl);
  };

  return (
    <div className="min-h-screen bg-white p-4 font-sans">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6 pb-4 border-b">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <Calendar className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold text-slate-900">Meeting Master</h1>
          <p className="text-xs text-slate-500">Outlook Add-in</p>
        </div>
      </div>

      {state === 'loading' && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          <span className="ml-2 text-sm text-slate-500">Loading…</span>
        </div>
      )}

      {(state === 'ready' || error) && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="meeting-title" className="text-sm font-medium">Meeting Title</Label>
            <Input
              id="meeting-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Q4 Sprint Planning"
              className="mt-1"
              onKeyDown={e => e.key === 'Enter' && handleCreateMeeting()}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded">
              {error}
            </div>
          )}

          <Button onClick={handleCreateMeeting} className="w-full" disabled={!title.trim()}>
            <Calendar className="w-4 h-4 mr-2" />
            Create Meeting &amp; Insert Link
          </Button>

          <p className="text-xs text-slate-400 text-center">
            Creates a Meeting Master session and inserts the link into your email
          </p>
        </div>
      )}

      {state === 'creating' && (
        <div className="flex flex-col items-center justify-center py-8 space-y-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-sm text-slate-600">Creating your meeting…</p>
        </div>
      )}

      {state === 'created' && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <Calendar className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-sm font-semibold text-green-800">Meeting created!</p>
            <p className="text-xs text-green-600 mt-1">
              {officeReady ? 'Link inserted into your email.' : 'Copy the link below.'}
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-1 font-medium">Meeting Link</p>
            <p className="text-xs text-slate-700 break-all">{meetingUrl}</p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={copyUrl} className="flex-1 text-xs gap-1">
              <Link2 className="w-3 h-3" />
              Copy Link
            </Button>
            <Button onClick={() => { setState('ready'); setTitle(''); setMeetingUrl(''); }} variant="ghost" className="flex-1 text-xs">
              New Meeting
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
