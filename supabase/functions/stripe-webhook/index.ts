import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13'

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
    const userId = session.metadata?.supabase_user_id
    const tier   = session.metadata?.tier ?? 'basic'

    if (!userId) {
      console.error('No supabase_user_id in session metadata')
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
      const welcomeEmail = `Welcome to Heartability!

Investing in your dreams and taking the time to track your progress, not productivity, will change your life. I'm not saying it will be easy, I'm not saying this technique is magic. But it can help you access the greatest tool available: optimism.

Here is how to find it:

1. Make the decision to take a step toward your dream
2. Take that step
3. Track the emotional journey that you experienced taking that step
4. Repeat

That's it. When you start to consider giving up, visit your Treasure Map and remember how far you have already come. How many things have already changed. If it doesn't look the way you imagined, that just means this isn't the end of your journey. You have to keep going, you have to keep trying.

As a paying member, if you show up to track your journey everyday you can take your place on the leaderboard and if you ever feel alone on your journey, feel free to pop into the group chat and let us know what you are going through. It's interesting how some weeks have clear patterns that emerge. Not surprising that when I initially developed this game, I was tracking moon transits and my emotional response to them in my Astrological studies (got something cooking to integrate that aspect too if you stick around!).

Visit the shipping room to learn more about future updates, which also include more community elements, a customized 2d side scrolling video game world rendered from your personal maps, and media libraries that you can search for inspiration and direction, and a self care library you can explore for resources (which will also be integrated into the 2d world).

Talk soon <3

Zoe Tinnes, Founder of Heartability`

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Zoe at Heartability <hello@heartability.com>',
          to: email,
          subject: 'Welcome to Heartability!',
          text: welcomeEmail,
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
