import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the logged-in user from the auth header
    const sb = createClient(
      Deno.env.get('SB_URL') ?? '',
      Deno.env.get('SB_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    const { data: { user }, error: userError } = await sb.auth.getUser(token)

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get the price ID from the request body
   const { priceId, tier, paymentMode, returnTo } = await req.json()

    // Only ever redirect back to a relative path on our own site — returnTo
    // comes from the client (document.referrer), so it must be sanitized
    // before it's dropped into an absolute redirect URL.
    const safeReturnTo = (typeof returnTo === 'string' && /^\/[A-Za-z0-9\-_./]*$/.test(returnTo) && !returnTo.startsWith('//'))
      ? returnTo
      : '/users/account-settings.html'

    // Create or retrieve Stripe customer
    const { data: profile } = await sb
      .from('user-profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    let customerId = profile?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id }
      })
      customerId = customer.id

      await sb.from('user-profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: paymentMode ?? 'subscription',
      allow_promotion_codes: true,
      success_url: `${req.headers.get('origin')}${safeReturnTo}?success=true`,
      cancel_url: `${req.headers.get('origin')}/users/membership.html?cancelled=true`,
      metadata: {
        supabase_user_id: user.id,
        tier: tier // 'basic' or 'founding'
      }
    })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
