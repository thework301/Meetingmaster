import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from './rate-limit';

export interface AuthUser {
  id: string;
  email: string;
  company_id: string;
  role: 'admin' | 'user' | 'viewer';
  plan: string;
  full_name: string;
}

export async function requireAuth(request: NextRequest): Promise<{
  user: AuthUser;
  error?: NextResponse;
}> {
  const rateLimitError = await checkRateLimit(request);
  if (rateLimitError) return { user: null as unknown as AuthUser, error: rateLimitError };

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return {
      user: null as unknown as AuthUser,
      error: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }),
    };
  }

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id, email, company_id, role, plan, full_name')
    .eq('id', session.user.id)
    .single();

  if (userError || !userRow) {
    return {
      user: null as unknown as AuthUser,
      error: NextResponse.json({ error: 'User not found' }, { status: 401 }),
    };
  }

  // Update last_active_at
  await supabase
    .from('users')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', session.user.id);

  return { user: userRow as AuthUser };
}

export async function requireAdmin(request: NextRequest): Promise<{
  user: AuthUser;
  error?: NextResponse;
}> {
  const { user, error } = await requireAuth(request);
  if (error) return { user, error };

  if (user.role !== 'admin') {
    return {
      user,
      error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }),
    };
  }

  return { user };
}

export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
