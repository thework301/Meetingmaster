'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getSpeakerColour, formatDuration } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Mic, MicOff, Flag, Users, Clock, X } from 'lucide-react';

interface SpeakerSegment {
  id?: string;
  speaker_label: string;
  speaker_name: string | null;
  start_time_seconds: number;
  end_time_seconds: number;
  text_content: string;
}

interface AgendaItem {
  id: string;
  title: string;
  duration_minutes: number;
  completed: boolean;
  position_order: number;
  owner_user_id: string | null;
}

interface Attendee {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  is_present: boolean;
  introduced_at: string | null;
  speaking_time_seconds: number;
  users: { id: string; full_name: string; avatar_url: string | null } | null;
}

interface ActionItemForm {
  title: string;
  description: string;
  assignee_id: string;
  due_date: string;
}

export default function LiveMeetingPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const supabase = createClient();

  const [meeting, setMeeting] = useState<{ id: string; title: string; company_id: string } | null>(null);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [segments, setSegments] = useState<SpeakerSegment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentAgendaIdx, setCurrentAgendaIdx] = useState(0);
  const [unknownSpeakerAlert, setUnknownSpeakerAlert] = useState<string | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionForm, setActionForm] = useState<ActionItemForm>({ title: '', description: '', assignee_id: '', due_date: '' });
  const [assignNameModal, setAssignNameModal] = useState<{ speakerLabel: string; transcriptId: string } | null>(null);
  const [assignedName, setAssignedName] = useState('');
  const [ending, setEnding] = useState(false);
  const [deepgramKey, setDeepgramKey] = useState<string | null>(null);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveRef = useRef<NodeJS.Timeout | null>(null);
  const unknownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<Date | null>(null);

  // Prevent accidental tab close during meeting
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Meeting is in progress. Are you sure you want to leave?';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const [loadError, setLoadError] = useState<string | null>(null);

  // Load meeting data
  useEffect(() => {
    async function loadMeeting() {
      const res = await fetch(`/api/meetings/${params.id}`);
      if (!res.ok) {
        const text = await res.text();
        setLoadError(`Failed to load meeting (${res.status}): ${text}`);
        return;
      }
      const { meeting: m } = await res.json();

      setMeeting({ id: m.id, title: m.title, company_id: m.company_id });
      setAgendaItems(m.agenda_items || []);
      setAttendees(m.meeting_attendees || []);

      // Start meeting
      await fetch(`/api/meetings/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress', started_at: new Date().toISOString() }),
      });

      startTimeRef.current = new Date();
    }
    loadMeeting();
  }, [params.id]);

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Auto-save every 30 seconds
  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      if (segments.length > 0) saveTranscript();
    }, 30000);
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current); };
  }, [segments]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments]);

  // Get Deepgram token and start recording
  const startRecording = useCallback(async () => {
    try {
      // Request microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Get Deepgram key
      const tokenRes = await fetch('/api/deepgram/token', { method: 'POST' });
      const tokenData = await tokenRes.json();
      const apiKey = tokenData.key;

      if (!apiKey) {
        setRecordingError('Voice transcription is not configured — DEEPGRAM_API_KEY missing. Contact your admin.');
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      // Pick best supported mimeType
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

      // Connect to Deepgram — use webm/opus format which browsers natively produce
      const ws = new WebSocket(
        `wss://api.deepgram.com/v1/listen?model=nova-2&diarize=true&punctuate=true&smart_format=true`,
        ['token', apiKey]
      );

      ws.onopen = () => {
        setIsRecording(true);
        const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
        const mediaRecorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(e.data);
          }
        };

        mediaRecorder.start(250); // Send chunks every 250ms
      };

      ws.onerror = () => {
        setRecordingError('Failed to connect to transcription service. Check your Deepgram API key.');
        setIsRecording(false);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type !== 'Results' || !data.channel?.alternatives?.[0]) return;

        const alt = data.channel.alternatives[0];
        const transcript = alt.transcript;
        if (!transcript || !data.is_final) return;

        const words = alt.words || [];
        if (words.length === 0) return;

        // Group words by speaker
        const speakerGroups: Record<string, { words: typeof words; start: number; end: number }> = {};
        words.forEach((word: { word: string; speaker: number; start: number; end: number }) => {
          const label = `Speaker ${word.speaker}`;
          if (!speakerGroups[label]) {
            speakerGroups[label] = { words: [], start: word.start, end: word.end };
          }
          speakerGroups[label].words.push(word);
          speakerGroups[label].end = word.end;
        });

        const newSegments: SpeakerSegment[] = Object.entries(speakerGroups).map(([label, group]) => ({
          speaker_label: label,
          speaker_name: null,
          start_time_seconds: group.start,
          end_time_seconds: group.end,
          text_content: group.words.map((w: { word: string }) => w.word).join(' '),
        }));

        setSegments(prev => [...prev, ...newSegments]);

        // Unknown speaker detection: show alert once per unknown speaker (not stacked)
        const firstUnnamed = newSegments.find(seg => !seg.speaker_name);
        if (firstUnnamed && !unknownTimerRef.current) {
          unknownTimerRef.current = setTimeout(() => {
            setUnknownSpeakerAlert(firstUnnamed.speaker_label);
            unknownTimerRef.current = null;
          }, 10000);
        }
      };

      ws.onclose = () => setIsRecording(false);

      wsRef.current = ws;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setRecordingError('Microphone access denied. Please allow microphone access in your browser settings and try again.');
      } else {
        setRecordingError('Failed to start recording. Please check your microphone and try again.');
      }
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    wsRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setIsRecording(false);
    clearTimeout(unknownTimerRef.current || undefined);
  }, []);

  const saveTranscript = useCallback(async () => {
    if (segments.length === 0) return;
    try {
      const res = await fetch(`/api/meetings/${params.id}/transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments }),
      });
      if (res.ok) {
        const data = await res.json();
        setTranscriptId(data.transcript_id);
      }
    } catch {
      // Silent fail — will retry on next auto-save
    }
  }, [segments, params.id]);

  const handleAssignName = async () => {
    if (!assignNameModal || !assignedName.trim() || !transcriptId) return;

    await fetch(`/api/meetings/${params.id}/transcript`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        speaker_label: assignNameModal.speakerLabel,
        speaker_name: assignedName,
        transcript_id: transcriptId,
      }),
    });

    // Update local segments
    setSegments(prev =>
      prev.map(s =>
        s.speaker_label === assignNameModal.speakerLabel ? { ...s, speaker_name: assignedName } : s
      )
    );

    setAssignNameModal(null);
    setAssignedName('');
    setUnknownSpeakerAlert(null);
  };

  const handleEndMeeting = async () => {
    setEnding(true);
    stopRecording();
    // Wait briefly for MediaRecorder to flush the last audio chunk and
    // for the final WebSocket transcript message to arrive
    await new Promise(resolve => setTimeout(resolve, 1500));
    await saveTranscript();

    const endedAt = new Date().toISOString();
    await fetch(`/api/meetings/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'completed',
        ended_at: endedAt,
      }),
    });

    // Remove beforeunload protection
    window.onbeforeunload = null;
    router.push(`/meeting/${params.id}/summary`);
  };

  const handleAddActionItem = async () => {
    if (!actionForm.title.trim()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await fetch('/api/action-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meeting_id: params.id,
        assigned_to_user_id: actionForm.assignee_id || session.user.id,
        title: actionForm.title,
        description: actionForm.description,
        due_date: actionForm.due_date || null,
      }),
    }).catch(() => {});

    setShowActionModal(false);
    setActionForm({ title: '', description: '', assignee_id: '', due_date: '' });
  };

  const toggleAgendaItem = async (itemId: string, completed: boolean) => {
    setAgendaItems(prev =>
      prev.map(a => a.id === itemId ? { ...a, completed } : a)
    );
    await supabase
      .from('agenda_items')
      .update({ completed })
      .eq('id', itemId);
  };

  // Get unique speakers in transcript
  const speakersInTranscript = Array.from(new Set(segments.map(s => s.speaker_label)));
  const speakerColourMap: Record<string, string> = {};
  speakersInTranscript.forEach((label, idx) => {
    speakerColourMap[label] = getSpeakerColour(idx);
  });

  const agendaProgress = agendaItems.length > 0
    ? Math.round((agendaItems.filter(a => a.completed).length / agendaItems.length) * 100)
    : 0;

  if (loadError) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950 text-white p-8">
        <div className="max-w-lg text-center">
          <p className="text-red-400 font-semibold text-lg mb-2">Could not load meeting</p>
          <p className="text-slate-400 text-sm break-all">{loadError}</p>
          <button onClick={() => router.push('/dashboard')} className="mt-6 px-4 py-2 bg-slate-800 rounded text-sm hover:bg-slate-700">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-white overflow-hidden">
      {/* Recording error banner */}
      {recordingError && (
        <div className="bg-red-900/80 text-red-200 text-xs px-4 py-2 flex items-center justify-between shrink-0">
          <span>{recordingError}</span>
          <button onClick={() => setRecordingError(null)} className="ml-4 text-red-300 hover:text-white">✕</button>
        </div>
      )}
      {/* Dark topbar */}
      <div className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          {/* Recording indicator */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${isRecording ? 'bg-red-900/50 text-red-300' : 'bg-slate-800 text-slate-400'}`}>
            <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 recording-pulse' : 'bg-slate-500'}`} />
            {isRecording ? 'Recording' : 'Not recording'}
          </div>
          <h1 className="text-sm font-semibold text-white hidden sm:block truncate max-w-xs">
            {meeting?.title || 'Loading…'}
          </h1>
        </div>

        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Clock className="w-4 h-4" />
          <span className="font-mono">{formatDuration(elapsedSeconds)}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={isRecording ? stopRecording : startRecording}
            className={`gap-2 text-xs h-8 ${isRecording ? 'border-red-500 text-red-400 hover:bg-red-900/20' : 'border-slate-600 text-slate-400 hover:bg-slate-800'}`}
          >
            {isRecording ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
            {isRecording ? 'Stop' : 'Start'} Recording
          </Button>
          <Button
            size="sm"
            onClick={handleEndMeeting}
            disabled={ending}
            className="bg-red-600 hover:bg-red-700 text-white gap-2 text-xs h-8"
          >
            {ending ? 'Ending…' : 'End Meeting'}
          </Button>
        </div>
      </div>

      {/* Unknown speaker alert */}
      {unknownSpeakerAlert && (
        <div className="bg-amber-900/80 border-b border-amber-700 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span className="text-amber-200 text-sm">
              Unknown speaker detected: <strong>{unknownSpeakerAlert}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-amber-600 text-amber-300 hover:bg-amber-900/50"
              onClick={() => {
                setAssignNameModal({ speakerLabel: unknownSpeakerAlert, transcriptId: transcriptId || '' });
              }}
            >
              Assign Name
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-amber-400"
              onClick={() => setUnknownSpeakerAlert(null)}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Agenda sidebar (left) */}
        <div className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col overflow-hidden shrink-0 hidden md:flex">
          <div className="p-3 border-b border-slate-800">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Agenda</p>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${agendaProgress}%` }}
                />
              </div>
              <span className="text-xs text-slate-400">{agendaProgress}%</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {agendaItems.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => toggleAgendaItem(item.id, !item.completed)}
                className={`w-full text-left flex items-start gap-2 p-2 rounded-md transition-colors text-xs ${
                  idx === currentAgendaIdx ? 'bg-blue-900/50 border border-blue-700' : 'hover:bg-slate-800'
                }`}
              >
                <div className={`w-4 h-4 rounded border shrink-0 mt-0.5 flex items-center justify-center ${
                  item.completed ? 'bg-green-600 border-green-600' : 'border-slate-600'
                }`}>
                  {item.completed && <CheckCircle className="w-3 h-3 text-white" />}
                </div>
                <div>
                  <p className={`text-slate-300 ${item.completed ? 'line-through text-slate-500' : ''}`}>
                    {item.title}
                  </p>
                  <p className="text-slate-500">{item.duration_minutes}m</p>
                </div>
              </button>
            ))}
            {agendaItems.length === 0 && (
              <p className="text-slate-500 text-xs p-2">No agenda items</p>
            )}
          </div>
        </div>

        {/* Transcript (centre) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Live Transcript</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowActionModal(true)}
              className="h-7 gap-1 text-xs border-slate-700 text-slate-400 hover:bg-slate-800"
            >
              <Flag className="w-3 h-3" />
              Flag Action
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {segments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <Mic className="w-8 h-8 mb-3 text-slate-600" />
                <p className="text-sm">Click &ldquo;Start Recording&rdquo; to begin transcription</p>
              </div>
            ) : (
              segments.map((seg, idx) => {
                const colour = speakerColourMap[seg.speaker_label] || '#6b7280';
                const displayName = seg.speaker_name || seg.speaker_label;
                return (
                  <div key={idx} className="flex gap-3">
                    <div
                      className="w-1 rounded-full shrink-0 mt-1 self-stretch min-h-[16px]"
                      style={{ backgroundColor: colour }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className="text-xs font-semibold cursor-pointer hover:underline"
                          style={{ color: colour }}
                          onClick={() => setAssignNameModal({
                            speakerLabel: seg.speaker_label,
                            transcriptId: transcriptId || '',
                          })}
                        >
                          {displayName}
                        </span>
                        <span className="text-xs text-slate-600">
                          {Math.floor(seg.start_time_seconds / 60)}:{String(Math.floor(seg.start_time_seconds % 60)).padStart(2, '0')}
                        </span>
                      </div>
                      <p className="text-slate-300 text-sm leading-relaxed">{seg.text_content}</p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Attendees sidebar (right) */}
        <div className="w-52 bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden shrink-0 hidden lg:flex">
          <div className="p-3 border-b border-slate-800">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1">
              <Users className="w-3 h-3" />
              Attendees ({attendees.length})
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {attendees.map(att => {
              const name = att.users?.full_name || att.guest_name || 'Unknown';
              const isIntroduced = !!att.introduced_at;
              const speakingSeconds = att.speaking_time_seconds || 0;

              return (
                <div key={att.id} className="p-2 rounded-md hover:bg-slate-800">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      att.is_present ? 'bg-green-700 text-green-200' : 'bg-slate-700 text-slate-400'
                    }`}>
                      {name[0]?.toUpperCase()}
                    </div>
                    <span className="text-xs text-slate-300 truncate">{name}</span>
                  </div>
                  {att.guest_name && !isIntroduced && (
                    <Badge variant="warning" className="text-xs py-0 px-1">Not introduced</Badge>
                  )}
                  {speakingSeconds > 0 && (
                    <div className="mt-1">
                      <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.min((speakingSeconds / 300) * 100, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{formatDuration(speakingSeconds)}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Action item modal */}
      {showActionModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-slate-700 space-y-4">
            <h3 className="font-semibold text-white">Flag Action Item</h3>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Title</label>
              <input
                value={actionForm.title}
                onChange={e => setActionForm(prev => ({ ...prev, title: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white text-sm placeholder-slate-400 focus:outline-none focus:border-blue-500"
                placeholder="What needs to be done?"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Description (optional)</label>
              <textarea
                value={actionForm.description}
                onChange={e => setActionForm(prev => ({ ...prev, description: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white text-sm placeholder-slate-400 focus:outline-none focus:border-blue-500 h-20 resize-none"
                placeholder="More details…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Assign to</label>
                <select
                  value={actionForm.assignee_id}
                  onChange={e => setActionForm(prev => ({ ...prev, assignee_id: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">Me</option>
                  {attendees.filter(a => a.user_id).map(a => (
                    <option key={a.id} value={a.user_id!}>
                      {a.users?.full_name || a.guest_name || 'Attendee'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Due date</label>
                <input
                  type="date"
                  value={actionForm.due_date}
                  onChange={e => setActionForm(prev => ({ ...prev, due_date: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setShowActionModal(false)} className="flex-1 text-slate-400">
                Cancel
              </Button>
              <Button onClick={handleAddActionItem} disabled={!actionForm.title.trim()} className="flex-1">
                Add Action Item
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Assign name modal */}
      {assignNameModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-xl p-6 max-w-sm w-full border border-slate-700 space-y-4">
            <h3 className="font-semibold text-white">Who is {assignNameModal.speakerLabel}?</h3>
            <input
              value={assignedName}
              onChange={e => setAssignedName(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white text-sm placeholder-slate-400 focus:outline-none focus:border-blue-500"
              placeholder="Enter their name"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAssignName()}
            />
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setAssignNameModal(null)} className="flex-1 text-slate-400">
                Cancel
              </Button>
              <Button onClick={handleAssignName} disabled={!assignedName.trim()} className="flex-1">
                Assign Name
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
