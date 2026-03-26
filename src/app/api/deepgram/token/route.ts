import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  // Create a temporary Deepgram API key via their REST API
  // This prevents exposing the main API key to clients
  try {
    const response = await fetch('https://api.deepgram.com/v1/projects', {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    });

    if (!response.ok) {
      // Fallback: return a limited-scope token hint (client uses server-side proxy instead)
      return NextResponse.json({
        hint: 'use_server_proxy',
        userId: user.id,
      });
    }

    const projects = await response.json();
    const projectId = projects.projects?.[0]?.project_id;

    if (!projectId) {
      return NextResponse.json({ hint: 'use_server_proxy', userId: user.id });
    }

    // Create temporary key with 1-hour TTL
    const keyResponse = await fetch(
      `https://api.deepgram.com/v1/projects/${projectId}/keys`,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment: `meeting-master-${user.id}-${Date.now()}`,
          scopes: ['usage:write'],
          time_to_live_in_seconds: 3600,
        }),
      }
    );

    if (keyResponse.ok) {
      const keyData = await keyResponse.json();
      return NextResponse.json({ key: keyData.key });
    }

    return NextResponse.json({ hint: 'use_server_proxy', userId: user.id });
  } catch {
    return NextResponse.json({ hint: 'use_server_proxy', userId: user.id });
  }
}
