import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function DELETE(request: NextRequest) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const supabase = createClient();
  const serviceClient = createServiceClient();

  // Check if user is the only admin — prevent orphaned company
  const { count: adminCount } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', user.company_id)
    .eq('role', 'admin');

  const { count: companyUserCount } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', user.company_id);

  if (adminCount === 1 && (companyUserCount || 0) > 1) {
    return NextResponse.json(
      { error: 'You are the only admin. Please assign another admin before deleting your account.' },
      { status: 400 }
    );
  }

  // Delete user data (cascades via FK)
  await serviceClient.from('users').delete().eq('id', user.id);

  // If last user in company, delete company too
  if ((companyUserCount || 0) === 1) {
    await serviceClient.from('companies').delete().eq('id', user.company_id);
  }

  // Delete auth user
  await serviceClient.auth.admin.deleteUser(user.id);

  return NextResponse.json({ deleted: true });
}
