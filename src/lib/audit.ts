import { createServiceClient } from '@/lib/supabase/server';

export async function logAudit({
  company_id,
  actor_user_id,
  action,
  target_table,
  target_id,
  metadata = {},
}: {
  company_id: string;
  actor_user_id: string;
  action: string;
  target_table: string;
  target_id: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = createServiceClient();
    await supabase.from('audit_logs').insert({
      company_id,
      actor_user_id,
      action,
      target_table,
      target_id,
      metadata,
    });
  } catch {
    // Audit logging should never break application flow
  }
}
