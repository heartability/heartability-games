import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13'
import { welcomeEmailText, welcomeEmailHtml } from '../_shared/email-templates.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const body = await req.text()

  let event: Stripe.Event

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret!)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return new Response('Webhook Error', { status: 400 })
  }

  const sb = createClient(
    Deno.env.get('SB_URL') ?? '',
    Deno.env.get('SB_SERVICE_ROLE_KEY') ?? ''
  )

  // ── Handle events ────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const tier = session.metadata?.tier ?? 'dream'

    let userId = session.metadata?.supabase_user_id

    // Sessions started from the Stripe Pricing Table widget (rather than
    // our create-checkout-session function) don't carry our metadata —
    // fall back to matching on the Stripe customer, which the widget's
    // Customer Session always ties to a known user.
    if (!userId && session.customer) {
      const { data: profile } = await sb
        .from('user-profiles')
        .select('id')
        .eq('stripe_customer_id', session.customer as string)
        .single()
      userId = profile?.id
    }

    if (!userId) {
      console.error('Could not resolve a user for checkout session', session.id)
      return new Response('Missing user ID', { status: 400 })
    }

    // Calculate expiry — 1 year from now
    const expiresAt = new Date()
    expiresAt.setFullYear(expiresAt.getFullYear() + 1)

    const { error } = await sb.from('user-profiles').update({
      membership_status:     tier,
      membership_tier:       tier,
      membership_expires_at: expiresAt.toISOString(),
    }).eq('id', userId)

    if (error) console.error('Error updating membership:', error)
    else console.log(`Membership activated: ${userId} → ${tier}`)

    // Send welcome email via Resend
    const email = session.customer_details?.email
    if (email) {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Zoe at Heartability <hello@heartability.com>',
          to: email,
          subject: 'Welcome to the Dream Membership!',
          text: welcomeEmailText(),
          html: welcomeEmailHtml(),
        }),
      })

      if (!resendRes.ok) {
        console.error('Failed to send welcome email:', await resendRes.text())
      } else {
        console.log(`Welcome email sent to ${email}`)
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription
    const customerId = subscription.customer as string

    // Find user by stripe_customer_id and reset to free
    const { error } = await sb.from('user-profiles').update({
      membership_status:     'free',
      membership_tier:       null,
      membership_expires_at: null,
    }).eq('stripe_customer_id', customerId)

    if (error) console.error('Error resetting membership:', error)
    else console.log(`Membership cancelled for customer: ${customerId}`)
  }

  if (event.type === 'invoice.payment_failed') {
    // Optional: log or notify when a renewal payment fails
    const invoice = event.data.object as Stripe.Invoice
    console.log(`Payment failed for customer: ${invoice.customer}`)
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
