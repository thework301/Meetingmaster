import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const user = data.session?.user;
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=no_user`);
  }

  // Check if user exists in our users table
  const serviceClient = createServiceClient();
  const { data: existingUser } = await serviceClient
    .from('users')
    .select('id')
    .eq('id', user.id)
    .single();

  if (!existingUser) {
    // New user — create a default company and user record
    const { data: company, error: companyError } = await serviceClient
      .from('companies')
      .insert({
        name: user.user_metadata?.company || `${user.user_metadata?.full_name || user.email}'s Team`,
        plan: 'free',
        seats_purchased: 5,
        seats_used: 1,
        billing_email: user.email!,
        data_retention_months: 12,
      })
      .select('id')
      .single();

    if (companyError || !company) {
      return NextResponse.redirect(`${origin}/login?error=setup_failed`);
    }

    await serviceClient.from('users').insert({
      id: user.id,
      email: user.email!,
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email!,
      avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
      company_id: company.id,
      role: 'admin', // first user in a company is admin
      plan: 'free',
      last_active_at: new Date().toISOString(),
    });
  }

  return NextResponse.redirect(`${origin}${next}`);
}
