import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/shared/lib/supabase-server';

// Map Lemon Squeezy variant ID → credits amount (one-time top-up packs)
const TOPUP_PACKS: Record<string, number> = {
  [process.env.LS_VARIANT_TOPUP_20  ?? 'unset']: 20,
  [process.env.LS_VARIANT_TOPUP_100 ?? 'unset']: 100,
  [process.env.LS_VARIANT_TOPUP_300 ?? 'unset']: 300,
};

// Map Lemon Squeezy product ID → plan + monthly credits
const SUBSCRIPTION_PLANS: Record<string, { credits: number; plan: string }> = {
  [process.env.LS_PRODUCT_MAKER ?? 'unset']: { credits: 100, plan: 'maker' },
  [process.env.LS_PRODUCT_PRO   ?? 'unset']: { credits: 300, plan: 'pro'   },
};

type LsAttributes = Record<string, unknown>;

interface LsPayload {
  meta: { event_name: string };
  data: { attributes: LsAttributes };
}

function verifySignature(rawBody: string, signature: string): boolean {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET ?? '';
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-signature') ?? '';

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: LsPayload;
  try {
    payload = JSON.parse(rawBody) as LsPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { meta, data } = payload;
  const eventName = meta.event_name;
  const attrs = data.attributes;

  const userId = (attrs.custom_data as { user_id?: string } | null)?.user_id;
  if (!userId) {
    return NextResponse.json({ error: 'Missing user_id in custom_data' }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (eventName === 'order_created') {
    const variantId = String(
      (attrs.first_order_item as { variant_id?: unknown } | null)?.variant_id ?? ''
    );
    const credits = TOPUP_PACKS[variantId];
    if (credits) {
      const { error } = await supabase.rpc('add_credits', {
        p_user_id: userId,
        p_amount: credits,
        p_action: 'topup',
      });
      if (error) {
        console.error('[ls-webhook] add_credits failed:', error.message);
        return NextResponse.json({ error: 'DB error' }, { status: 500 });
      }
    }
    return NextResponse.json({ received: true });
  }

  if (eventName === 'subscription_created' || eventName === 'subscription_renewed') {
    const productId = String(attrs.product_id ?? '');
    const sub = SUBSCRIPTION_PLANS[productId];
    if (sub) {
      const { error } = await supabase
        .from('credits')
        .update({ balance: sub.credits, plan: sub.plan, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (error) {
        console.error('[ls-webhook] credits update failed:', error.message);
        return NextResponse.json({ error: 'DB error' }, { status: 500 });
      }
    }
    return NextResponse.json({ received: true });
  }

  // Other events: acknowledge without processing
  return NextResponse.json({ received: true });
}
