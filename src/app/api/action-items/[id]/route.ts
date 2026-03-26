import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const updateSchema = z.object({
  status: z.enum(['open', 'done', 'overdue']).optional(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  due_date: z.string().date().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createClient();

  // Verify ownership
  const { data: item } = await supabase
    .from('action_items')
    .select('assigned_to_user_id')
    .eq('id', params.id)
    .single();

  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (item.assigned_to_user_id !== user.id && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error: updateError } = await supabase
    .from('action_items')
    .update(parsed.data)
    .eq('id', params.id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}
