import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

export async function POST(request: NextRequest) {
  const { user, error } = await requireAdmin(request);
  if (error) return error;

  const supabase = createClient();
  const { data: company } = await supabase
    .from('companies')
    .select('stripe_customer_id')
    .eq('id', user.company_id)
    .single();

  if (!company?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account found' }, { status: 404 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: company.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin/settings`,
  });

  return NextResponse.json({ url: session.url });
}
