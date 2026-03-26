import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

const PLAN_MAP: Record<string, string> = {
  [process.env.STRIPE_PRICE_PRO_MONTHLY || '']: 'pro',
  [process.env.STRIPE_PRICE_TEAM_MONTHLY || '']: 'team',
  [process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || '']: 'enterprise',
};

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = createServiceClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.CheckoutSession;
      const companyId = session.metadata?.company_id;
      const plan = session.metadata?.plan;

      if (companyId && plan) {
        await supabase
          .from('companies')
          .update({ plan, stripe_customer_id: session.customer as string })
          .eq('id', companyId);

        // Update all users in company
        await supabase
          .from('users')
          .update({ plan })
          .eq('company_id', companyId);
      }
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items.data[0]?.price.id;
      const plan = PLAN_MAP[priceId] || 'free';
      const companyId = sub.metadata?.company_id;

      if (companyId) {
        await supabase
          .from('companies')
          .update({ plan })
          .eq('id', companyId);
        await supabase
          .from('users')
          .update({ plan })
          .eq('company_id', companyId);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const companyId = sub.metadata?.company_id;

      if (companyId) {
        await supabase
          .from('companies')
          .update({ plan: 'free' })
          .eq('id', companyId);
        await supabase
          .from('users')
          .update({ plan: 'free' })
          .eq('company_id', companyId);
      }
      break;
    }

    case 'invoice.payment_failed': {
      // Optionally notify admin
      break;
    }
  }

  return NextResponse.json({ received: true });
}
