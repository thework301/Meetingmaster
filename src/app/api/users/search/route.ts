import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const schema = z.object({
  q: z.string().min(1).max(100),
});

export async function GET(request: NextRequest) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const q = request.nextUrl.searchParams.get('q') || '';
  const parsed = schema.safeParse({ q });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, email, avatar_url, role')
    .eq('company_id', user.company_id)
    .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(10);

  return NextResponse.json({ users: users || [] });
}
