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
      const welcomeEmail = `Welcome to the Dream Membership!

You chose to listen to your heart today, and that means something. It's the first step to making your dreams come true. If you keep listening to that voice, your whole life will change. Anything is possible…you just have to imagine it.

Your benefits:
The Dream Matrix (heartability.com/matrix/dream) - track your goals over time
The Cosmic Matrix (heartability.com/matrix/cosmic) - track how astrology influences your life.

Investing in your dreams and taking the time to track your progress, not productivity, will change your life. It won't be easy, but when you start to consider giving up, visit the archive (heartability.com/matrix/archive). Remember how far you have already come. How many things have already changed. The world is infinite, and so are you.

Visit the Shipping Room (heartability.com/rooms/shipping) to learn more about future updates, including more rooms in the castle, a customized 2d side scrolling video game world rendered from your personal maps, collective media libraries of inspiration, and so much more. Your support makes that possible. Thank you for believing in yourself and for believing in Heartability — may we both be winners. ꩜

Talk soon <3

Zoe Tinnes, Founder of Heartability`

      const welcomeEmailHtml = `<p>Welcome to the Dream Membership!</p>
<p>You chose to listen to your heart today, and that means something. It's the first step to making your dreams come true. If you keep listening to that voice, your whole life will change. Anything is possible…you just have to imagine it.</p>
<p>Your benefits:<br>
<a href="https://heartability.com/matrix/dream">The Dream Matrix</a> - track your goals over time<br>
<a href="https://heartability.com/matrix/cosmic">The Cosmic Matrix</a> - track how astrology influences your life.</p>
<p>Investing in your dreams and taking the time to track your progress, not productivity, will change your life. It won't be easy, but when you start to consider giving up, visit the <a href="https://heartability.com/matrix/archive">archive</a>. Remember how far you have already come. How many things have already changed. The world is infinite, and so are you.</p>
<p>Visit the <a href="https://heartability.com/rooms/shipping">Shipping Room</a> to learn more about future updates, including more rooms in the castle, a customized 2d side scrolling video game world rendered from your personal maps, collective media libraries of inspiration, and so much more. Your support makes that possible. Thank you for believing in yourself and for believing in Heartability — may we both be winners. ꩜</p>
<p>Talk soon &lt;3</p>
<p>Zoe Tinnes, Founder of Heartability</p>`

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
          text: welcomeEmail,
          html: welcomeEmailHtml,
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
