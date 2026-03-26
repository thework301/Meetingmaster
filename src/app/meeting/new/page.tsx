'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { z } from 'zod';
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Search,
  X,
  ChevronDown,
  Users,
  Mic,
  FileText,
  Mail,
  Calendar,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgendaItem {
  id: string;
  title: string;
  duration_minutes: number;
  owner?: string;
}

interface Attendee {
  id: string;
  user_id?: string;
  guest_name?: string;
  guest_email?: string;
  full_name: string;
  email: string;
  rsvp_status: 'invited' | 'accepted' | 'declined' | 'maybe';
  is_guest: boolean;
}

interface CompanyUser {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
}

interface Series {
  id: string;
  name: string;
}

// ─── Validation schema ────────────────────────────────────────────────────────

const createMeetingSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  meeting_type: z.string().min(1, 'Meeting type is required'),
  agenda_items: z.array(
    z.object({
      title: z.string().min(1),
      duration_minutes: z.number().min(1).max(480),
      owner: z.string().optional(),
    })
  ),
  attendees: z.array(
    z.object({
      user_id: z.string().optional(),
      guest_name: z.string().optional(),
      guest_email: z.string().email().optional(),
    })
  ),
  is_series: z.boolean(),
  series_id: z.string().optional(),
  folder_id: z.string().optional(),
  settings: z.object({
    transcription_enabled: z.boolean(),
    auto_summary_enabled: z.boolean(),
    send_absent_email: z.boolean(),
  }),
});

// ─── Constants ────────────────────────────────────────────────────────────────

const MEETING_TYPES = [
  'Standup',
  'Team Sync',
  '1:1',
  'Planning',
  'Retrospective',
  'All Hands',
  'Workshop',
  'Other',
] as const;

const RSVP_VARIANT: Record<Attendee['rsvp_status'], 'success' | 'destructive' | 'warning' | 'secondary'> = {
  accepted: 'success',
  declined: 'destructive',
  maybe: 'warning',
  invited: 'secondary',
};

// ─── Sortable Agenda Item ─────────────────────────────────────────────────────

function SortableAgendaItem({
  item,
  onUpdate,
  onRemove,
}: {
  item: AgendaItem;
  onUpdate: (id: string, field: keyof AgendaItem, value: string | number) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 rounded-lg border border-border bg-background p-3"
    >
      <button
        className="mt-2 cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          className="flex-1"
          placeholder="Agenda item title"
          value={item.title}
          onChange={(e) => onUpdate(item.id, 'title', e.target.value)}
          aria-label="Agenda item title"
        />
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={480}
            className="w-20"
            placeholder="Min"
            value={item.duration_minutes}
            onChange={(e) => onUpdate(item.id, 'duration_minutes', parseInt(e.target.value, 10) || 1)}
            aria-label="Duration in minutes"
          />
          <span className="shrink-0 text-xs text-muted-foreground">min</span>
          <Input
            className="w-28"
            placeholder="Owner"
            value={item.owner ?? ''}
            onChange={(e) => onUpdate(item.id, 'owner', e.target.value)}
            aria-label="Agenda item owner"
          />
        </div>
      </div>

      <button
        className="mt-1.5 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(item.id)}
        aria-label="Remove agenda item"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
}) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        checked ? 'bg-primary' : 'bg-input'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NewMeetingPage() {
  const router = useRouter();

  // Form state
  const [title, setTitle] = useState('');
  const [meetingType, setMeetingType] = useState('');
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [isSeries, setIsSeries] = useState(false);
  const [seriesId, setSeriesId] = useState('');
  const [createNewSeries, setCreateNewSeries] = useState(false);
  const [newSeriesName, setNewSeriesName] = useState('');
  const [settings, setSettings] = useState({
    transcription_enabled: true,
    auto_summary_enabled: true,
    send_absent_email: false,
  });

  // UI state
  const [userSearch, setUserSearch] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [searchResults, setSearchResults] = useState<CompanyUser[]>([]);
  const [existingSeries, setExistingSeries] = useState<Series[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Fetch company users on mount
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('users')
      .select('id, full_name, email, avatar_url')
      .then(({ data }) => {
        if (data) setCompanyUsers(data as CompanyUser[]);
      });

    supabase
      .from('meeting_series')
      .select('id, name')
      .then(({ data }) => {
        if (data) setExistingSeries(data as Series[]);
      });
  }, []);

  // Search users
  useEffect(() => {
    if (!userSearch.trim()) {
      setSearchResults([]);
      setShowUserDropdown(false);
      return;
    }
    const lower = userSearch.toLowerCase();
    const results = companyUsers.filter(
      (u) =>
        (u.full_name.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower)) &&
        !attendees.some((a) => a.user_id === u.id)
    );
    setSearchResults(results);
    setShowUserDropdown(results.length > 0);
  }, [userSearch, companyUsers, attendees]);

  // ─── Agenda helpers ───────────────────────────────────────────────────────

  const addAgendaItem = useCallback(() => {
    setAgendaItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), title: '', duration_minutes: 15, owner: '' },
    ]);
  }, []);

  const updateAgendaItem = useCallback(
    (id: string, field: keyof AgendaItem, value: string | number) => {
      setAgendaItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
      );
    },
    []
  );

  const removeAgendaItem = useCallback((id: string) => {
    setAgendaItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setAgendaItems((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, []);

  // ─── Attendee helpers ─────────────────────────────────────────────────────

  const addCompanyUser = useCallback((user: CompanyUser) => {
    setAttendees((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        user_id: user.id,
        full_name: user.full_name,
        email: user.email,
        rsvp_status: 'invited',
        is_guest: false,
      },
    ]);
    setUserSearch('');
    setShowUserDropdown(false);
  }, []);

  const addGuest = useCallback(() => {
    const emailResult = z.string().email().safeParse(guestEmail.trim());
    if (!emailResult.success) {
      setErrors((e) => ({ ...e, guestEmail: 'Valid email required' }));
      return;
    }
    if (attendees.some((a) => a.email === guestEmail.trim())) {
      setErrors((e) => ({ ...e, guestEmail: 'Already added' }));
      return;
    }
    setErrors((e) => ({ ...e, guestEmail: '' }));
    setAttendees((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        guest_email: guestEmail.trim(),
        guest_name: guestName.trim() || undefined,
        full_name: guestName.trim() || guestEmail.trim(),
        email: guestEmail.trim(),
        rsvp_status: 'invited',
        is_guest: true,
      },
    ]);
    setGuestEmail('');
    setGuestName('');
  }, [guestEmail, guestName, attendees]);

  const removeAttendee = useCallback((id: string) => {
    setAttendees((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // ─── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    // Validate
    const parseResult = createMeetingSchema.safeParse({
      title: title.trim(),
      meeting_type: meetingType,
      agenda_items: agendaItems.map((i) => ({
        title: i.title,
        duration_minutes: i.duration_minutes,
        owner: i.owner || undefined,
      })),
      attendees: attendees.map((a) => ({
        user_id: a.user_id,
        guest_name: a.guest_name,
        guest_email: a.guest_email,
      })),
      is_series: isSeries,
      series_id: seriesId || undefined,
      settings,
    });

    if (!parseResult.success) {
      const fieldErrors: Record<string, string> = {};
      parseResult.error.errors.forEach((e) => {
        const path = e.path.join('.');
        fieldErrors[path] = e.message;
      });
      setErrors(fieldErrors);
      return;
    }

    // Build body
    const body: Record<string, unknown> = { ...parseResult.data };
    if (isSeries && createNewSeries && newSeriesName.trim()) {
      body.new_series_name = newSeriesName.trim();
      delete body.series_id;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrors({ form: data.error ?? 'Failed to create meeting' });
        return;
      }

      router.push(`/meeting/${data.id}/live`);
    } catch {
      setErrors({ form: 'Network error. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    title,
    meetingType,
    agendaItems,
    attendees,
    isSeries,
    seriesId,
    createNewSeries,
    newSeriesName,
    settings,
    router,
  ]);

  const totalDuration = agendaItems.reduce((sum, i) => sum + i.duration_minutes, 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-lg font-semibold">Create New Meeting</h1>
          <Button onClick={handleSubmit} disabled={isSubmitting} size="sm">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              'Start Meeting'
            )}
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        {/* Global form error */}
        {errors.form && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errors.form}
          </div>
        )}

        {/* ── Meeting Title ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Meeting Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Meeting Title *</Label>
              <Input
                id="title"
                placeholder="e.g. Weekly Engineering Standup"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={errors.title ? 'border-destructive' : ''}
              />
              {errors.title && (
                <p className="text-xs text-destructive">{errors.title}</p>
              )}
            </div>

            {/* Meeting type pills */}
            <div className="space-y-1.5">
              <Label>Meeting Type *</Label>
              <div className="flex flex-wrap gap-2">
                {MEETING_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => setMeetingType(type)}
                    className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                      meetingType === type
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-foreground hover:border-primary hover:text-primary'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              {errors.meeting_type && (
                <p className="text-xs text-destructive">{errors.meeting_type}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Agenda Items ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Agenda
                {totalDuration > 0 && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({totalDuration} min total)
                  </span>
                )}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={addAgendaItem}>
                <Plus className="mr-1 h-4 w-4" />
                Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {agendaItems.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No agenda items yet. Add one to get started.
              </p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={agendaItems.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {agendaItems.map((item) => (
                      <SortableAgendaItem
                        key={item.id}
                        item={item}
                        onUpdate={updateAgendaItem}
                        onRemove={removeAgendaItem}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </CardContent>
        </Card>

        {/* ── Attendees ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Attendees
              {attendees.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {attendees.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search company users */}
            <div className="space-y-1.5">
              <Label htmlFor="user-search">Add Team Member</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="user-search"
                  className="pl-9"
                  placeholder="Search by name or email…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  onFocus={() => userSearch && setShowUserDropdown(true)}
                  onBlur={() => setTimeout(() => setShowUserDropdown(false), 150)}
                />
                {showUserDropdown && (
                  <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md">
                    {searchResults.map((user) => (
                      <button
                        key={user.id}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                        onMouseDown={() => addCompanyUser(user)}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {user.full_name.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <div className="font-medium">{user.full_name}</div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Add guest */}
            <div className="space-y-1.5">
              <Label>Add Guest</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Guest name (optional)"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="flex-1"
                />
                <Input
                  type="email"
                  placeholder="guest@example.com"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  className={`flex-1 ${errors.guestEmail ? 'border-destructive' : ''}`}
                  onKeyDown={(e) => e.key === 'Enter' && addGuest()}
                />
                <Button variant="outline" onClick={addGuest} size="default">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {errors.guestEmail && (
                <p className="text-xs text-destructive">{errors.guestEmail}</p>
              )}
            </div>

            {/* Attendee list */}
            {attendees.length > 0 && (
              <div className="space-y-2">
                {attendees.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {a.full_name.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <div className="text-sm font-medium">{a.full_name}</div>
                        <div className="text-xs text-muted-foreground">{a.email}</div>
                      </div>
                      {a.is_guest && (
                        <Badge variant="outline" className="text-xs">
                          Guest
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={RSVP_VARIANT[a.rsvp_status]}>
                        {a.rsvp_status.charAt(0).toUpperCase() + a.rsvp_status.slice(1)}
                      </Badge>
                      <button
                        onClick={() => removeAttendee(a.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${a.full_name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Series ────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Meeting Series
              </CardTitle>
              <Toggle
                id="series-toggle"
                checked={isSeries}
                onChange={setIsSeries}
              />
            </div>
          </CardHeader>
          {isSeries && (
            <CardContent className="space-y-3">
              <div className="flex gap-3">
                <button
                  onClick={() => setCreateNewSeries(false)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    !createNewSeries
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-primary'
                  }`}
                >
                  Link to existing series
                </button>
                <button
                  onClick={() => setCreateNewSeries(true)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    createNewSeries
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-primary'
                  }`}
                >
                  Create new series
                </button>
              </div>

              {createNewSeries ? (
                <div className="space-y-1.5">
                  <Label htmlFor="series-name">Series Name</Label>
                  <Input
                    id="series-name"
                    placeholder="e.g. Weekly Team Sync"
                    value={newSeriesName}
                    onChange={(e) => setNewSeriesName(e.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="series-select">Select Series</Label>
                  <div className="relative">
                    <select
                      id="series-select"
                      value={seriesId}
                      onChange={(e) => setSeriesId(e.target.value)}
                      className="flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">Select a series…</option>
                      {existingSeries.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* ── Session Settings ───────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Session Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Transcription */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mic className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="transcription" className="cursor-pointer font-medium">
                    Live Transcription
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Record and transcribe the meeting audio with speaker diarisation
                  </p>
                </div>
              </div>
              <Toggle
                id="transcription"
                checked={settings.transcription_enabled}
                onChange={(v) => setSettings((s) => ({ ...s, transcription_enabled: v }))}
              />
            </div>

            <div className="border-t" />

            {/* Auto-summary */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="auto-summary" className="cursor-pointer font-medium">
                    Auto-generate Summary
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    AI generates a meeting summary automatically after the meeting ends
                  </p>
                </div>
              </div>
              <Toggle
                id="auto-summary"
                checked={settings.auto_summary_enabled}
                onChange={(v) => setSettings((s) => ({ ...s, auto_summary_enabled: v }))}
              />
            </div>

            <div className="border-t" />

            {/* Absent email */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="absent-email" className="cursor-pointer font-medium">
                    Email Absent Attendees
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Send the summary to attendees who were not present
                  </p>
                </div>
              </div>
              <Toggle
                id="absent-email"
                checked={settings.send_absent_email}
                onChange={(v) => setSettings((s) => ({ ...s, send_absent_email: v }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Submit ─────────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-3 pb-8">
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} size="lg">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Meeting…
              </>
            ) : (
              'Start Meeting'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
