import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13'
import { welcomeEmailText, welcomeEmailHtml } from '../_shared/email-templates.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})

// Stripe Price ID -> membership tier. Checkout sessions started from the
// hosted Pricing Table carry no metadata at all, so this is the only
// reliable way to know what was actually purchased — never trust
// session.metadata?.tier as the primary source (see checkout.session.completed
// below).
const PRICE_TIER_MAP: Record<string, 'dream' | 'founding'> = {
  'price_1TX47YA6JE5MLfPsIZAXk3QY': 'dream',    // dream — monthly
  'price_1Tga4bA6JE5MLfPsJ5pzjRgo': 'dream',    // dream — yearly
  'price_1TgaQqA6JE5MLfPs5oPFirei': 'founding', // founding — one-time $1k, lifetime
}

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

  // Idempotency — Stripe redelivers events that don't get a fast 200, so the
  // same event.id can arrive more than once. Claim it via a unique-constraint
  // insert; if another delivery already claimed it, skip processing (but
  // still return 200 so Stripe doesn't keep retrying).
  const { error: dedupeError } = await sb
    .from('stripe_webhook_events')
    .insert({ id: event.id, type: event.type })

  if (dedupeError) {
    if (dedupeError.code === '23505') {
      console.log(`Duplicate delivery of event ${event.id} (${event.type}), skipping`)
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
    console.error('Error recording webhook event:', dedupeError)
  }

  // ── Handle events ────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    // Resolve tier from what was actually purchased, not from client-supplied
    // metadata (the Pricing Table flow — our real purchase path — doesn't
    // send any). Falls back to metadata only for the legacy/unused
    // create-checkout-session path, and to 'dream' as a last resort with a
    // loud warning so a misconfigured/new price doesn't silently misprice
    // someone (this already happened once: every Pricing Table purchase was
    // defaulting to 'dream', including a real founding purchase).
    let tier: 'dream' | 'founding' = session.metadata?.tier as 'dream' | 'founding'
    try {
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 })
      const priceId = lineItems.data[0]?.price?.id
      const mappedTier = priceId ? PRICE_TIER_MAP[priceId] : undefined
      if (mappedTier) {
        tier = mappedTier
      } else {
        console.error(`Unrecognized price ID on checkout session ${session.id}: ${priceId}. Falling back to metadata/default.`)
        tier = tier ?? 'dream'
      }
    } catch (e) {
      console.error('Failed to look up line items for checkout session', session.id, e)
      tier = tier ?? 'dream'
    }

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

    // founding is a one-time $1k payment for lifetime access — no expiry.
    // dream is a recurring subscription — cosmetic display expiry, refreshed
    // on every invoice.payment_succeeded below.
    let expiresAt: string | null = null
    if (tier === 'dream') {
      const d = new Date()
      d.setFullYear(d.getFullYear() + 1)
      expiresAt = d.toISOString()
    }

    const { error } = await sb.from('user-profiles').update({
      membership_status:     tier,
      membership_tier:       tier,
      membership_expires_at: expiresAt,
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

  if (event.type === 'invoice.payment_succeeded') {
    // Covers both the initial subscription invoice and every renewal.
    // membership_expires_at isn't used to gate access anywhere (only
    // membership_status is), but keep it accurate for the admin panel.
    const invoice = event.data.object as Stripe.Invoice
    const customerId = invoice.customer as string

    if (invoice.subscription && customerId) {
      const expiresAt = new Date()
      expiresAt.setFullYear(expiresAt.getFullYear() + 1)

      const { error } = await sb.from('user-profiles')
        .update({ membership_expires_at: expiresAt.toISOString() })
        .eq('stripe_customer_id', customerId)

      if (error) console.error('Error refreshing membership expiry:', error)
      else console.log(`Membership expiry refreshed for customer: ${customerId}`)
    }
  }

  if (event.type === 'invoice.payment_failed') {
    // Smart Retries keep working the card in the background; we deliberately
    // leave the member's access untouched during that window (decision made
    // 2026-08-16) and only downgrade when Stripe gives up and fires
    // customer.subscription.deleted. This handler just logs for visibility.
    const invoice = event.data.object as Stripe.Invoice
    console.log(`Payment failed for customer: ${invoice.customer}`)
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
