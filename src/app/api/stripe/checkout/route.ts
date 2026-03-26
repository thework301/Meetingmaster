import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

const PRICE_MAP: Record<string, string> = {
  pro: process.env.STRIPE_PRICE_PRO_MONTHLY!,
  team: process.env.STRIPE_PRICE_TEAM_MONTHLY!,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY!,
};

export async function GET(request: NextRequest) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const plan = request.nextUrl.searchParams.get('plan');
  if (!plan || !PRICE_MAP[plan]) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: company } = await supabase
    .from('companies')
    .select('stripe_customer_id, name, billing_email')
    .eq('id', user.company_id)
    .single();

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  let customerId = company.stripe_customer_id;

  // Create Stripe customer if needed
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: company.billing_email,
      name: company.name,
      metadata: { company_id: user.company_id },
    });
    customerId = customer.id;
    await supabase
      .from('companies')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.company_id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: PRICE_MAP[plan], quantity: 1 }],
    success_url: `${appUrl}/dashboard?upgraded=true`,
    cancel_url: `${appUrl}/admin/settings`,
    metadata: { company_id: user.company_id, plan },
    subscription_data: {
      metadata: { company_id: user.company_id, plan },
    },
  });

  return NextResponse.redirect(session.url!);
}
