import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';

export async function DELETE(request: NextRequest) {
  const { user, error } = await requireAdmin(request);
  if (error) return error;

  const serviceClient = createServiceClient();

  await logAudit({
    company_id: user.company_id,
    actor_user_id: user.id,
    action: 'DELETE_COMPANY_DATA',
    target_table: 'companies',
    target_id: user.company_id,
    metadata: { initiated_by: user.email },
  });

  // Delete all company data — cascades via FK constraints
  // Order matters: most dependent tables first
  const { error: deleteError } = await serviceClient
    .from('companies')
    .delete()
    .eq('id', user.company_id);

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to delete company data' }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
