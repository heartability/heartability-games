import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13'

// One-time backfill: real (non-promo) dream subscribers created before
// billing_interval existed on user-profiles had no record of whether they
// bought monthly or yearly. Looks up each one's live Stripe subscription and
// fills it in. Run manually once (see stripe-webhook for the price ->
// interval mapping this mirrors); safe to re-run, it's idempotent.
const PRICE_INTERVAL: Record<string, 'monthly' | 'yearly'> = {
  'price_1TX47YA6JE5MLfPsIZAXk3QY': 'monthly',
  'price_1Tga4bA6JE5MLfPsJ5pzjRgo': 'yearly',
}

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})

serve(async (_req) => {
  const sb = createClient(
    Deno.env.get('SB_URL') ?? '',
    Deno.env.get('SB_SERVICE_ROLE_KEY') ?? ''
  )

  const { data: profiles, error } = await sb
    .from('user-profiles')
    .select('id, username, stripe_customer_id')
    .eq('membership_status', 'dream')
    .eq('promo_free_year', false)
    .is('billing_interval', null)
    .not('stripe_customer_id', 'is', null)

  if (error) {
    console.error('Error fetching real dream subscribers:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const results: Record<string, string> = {}
  for (const profile of profiles ?? []) {
    try {
      const subs = await stripe.subscriptions.list({ customer: profile.stripe_customer_id, status: 'active', limit: 1 })
      const priceId = subs.data[0]?.items.data[0]?.price?.id
      const interval = priceId ? PRICE_INTERVAL[priceId] : undefined

      if (!interval) {
        console.error(`Could not resolve billing interval for ${profile.username} (${profile.id}), price: ${priceId}`)
        results[profile.username ?? profile.id] = `unresolved (price: ${priceId ?? 'none'})`
        continue
      }

      const { error: updateError } = await sb.from('user-profiles').update({ billing_interval: interval }).eq('id', profile.id)
      if (updateError) throw updateError

      results[profile.username ?? profile.id] = interval
    } catch (e) {
      console.error(`Failed to backfill ${profile.id}:`, e)
      results[profile.username ?? profile.id] = `error: ${e.message}`
    }
  }

  return new Response(JSON.stringify({ processed: profiles?.length ?? 0, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
