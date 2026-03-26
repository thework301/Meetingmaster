import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { ConsentBanner } from '@/components/consent-banner';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) redirect('/login');

  const { data: user } = await supabase
    .from('users')
    .select('id, full_name, email, avatar_url, role, plan, company_id')
    .eq('id', session.user.id)
    .single();

  const { data: folders } = await supabase
    .from('folders')
    .select('*')
    .order('name');

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <DashboardSidebar user={user} folders={folders || []} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <ConsentBanner />
    </div>
  );
}
