import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const SPEAKER_COLOURS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
];

export function getSpeakerColour(index: number): string {
  return SPEAKER_COLOURS[index % SPEAKER_COLOURS.length];
}

export function sanitiseHtml(dirty: string): string {
  if (typeof window !== 'undefined') {
    const DOMPurify = require('dompurify');
    return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  }
  // Server-side: strip all HTML
  return dirty.replace(/<[^>]*>/g, '');
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

export const PLAN_LIMITS = {
  free: {
    meetings_per_month: 5,
    max_duration_minutes: 30,
    max_attendees: 4,
    history_days: 30,
    word_pdf_export: false,
    escalation: false,
    series_timeline: false,
    admin_panel: false,
  },
  pro: {
    meetings_per_month: Infinity,
    max_duration_minutes: Infinity,
    max_attendees: Infinity,
    history_days: Infinity,
    word_pdf_export: true,
    escalation: true,
    series_timeline: true,
    admin_panel: false,
  },
  team: {
    meetings_per_month: Infinity,
    max_duration_minutes: Infinity,
    max_attendees: Infinity,
    history_days: Infinity,
    word_pdf_export: true,
    escalation: true,
    series_timeline: true,
    admin_panel: true,
  },
  enterprise: {
    meetings_per_month: Infinity,
    max_duration_minutes: Infinity,
    max_attendees: Infinity,
    history_days: Infinity,
    word_pdf_export: true,
    escalation: true,
    series_timeline: true,
    admin_panel: true,
  },
};
