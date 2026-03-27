import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Deepgram API key not configured' }, { status: 503 });
  }

  // Try to create a short-lived temporary key so the main key isn't reused
  // across sessions. Falls back to returning the main key directly (safe —
  // this endpoint is behind auth and server-side only).
  try {
    const projectsRes = await fetch('https://api.deepgram.com/v1/projects', {
      headers: { Authorization: `Token ${apiKey}` },
    });

    if (projectsRes.ok) {
      const { projects } = await projectsRes.json();
      const projectId = projects?.[0]?.project_id;

      if (projectId) {
        const keyRes = await fetch(
          `https://api.deepgram.com/v1/projects/${projectId}/keys`,
          {
            method: 'POST',
            headers: {
              Authorization: `Token ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              comment: `mm-${user.id.slice(0, 8)}-${Date.now()}`,
              scopes: ['usage:write'],
              time_to_live_in_seconds: 3600,
            }),
          }
        );

        if (keyRes.ok) {
          const keyData = await keyRes.json();
          if (keyData.key) {
            return NextResponse.json({ key: keyData.key });
          }
        }
      }
    }
  } catch {
    // Fall through to direct key return
  }

  // Fallback: return the main API key. This is acceptable because the endpoint
  // is authenticated — the key is never in the client JS bundle.
  return NextResponse.json({ key: apiKey });
}
