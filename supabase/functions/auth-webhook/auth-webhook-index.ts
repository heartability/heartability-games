import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  try {
    const payload = await req.json()

    // Only fire on new user signups
    if (payload.type !== 'INSERT' || payload.table !== 'users') {
      return new Response(JSON.stringify({ received: true }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const email = payload.record?.email
    if (!email) {
      return new Response(JSON.stringify({ error: 'No email found' }), { status: 400 })
    }

    const freeWelcomeEmail = `Welcome to Heartability!

Investing in your dreams and taking the time to track your progress, not productivity, will change your life. I'm not saying it will be easy, I'm not saying this technique is magic. But it can help you access the greatest tool available: optimism.

Here is how to find it:

1. Make the decision to take a step toward your dream
2. Take that step
3. Track the emotional journey that you experienced taking that step
4. Repeat

That's it. When you start to consider giving up, visit your Treasure Map and remember how far you have already come. How many things have already changed. If it doesn't look the way you imagined, that just means this isn't the end of your journey. You have to keep going, you have to keep trying.

When you're ready to go deeper, a paid membership unlocks the leaderboard so you can track your daily streak, access to the community group chat, and a locked-in rate that never increases. You can upgrade anytime at heartability.com/membership.

Talk soon 🤍

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
        text: freeWelcomeEmail,
      }),
    })

    if (!resendRes.ok) {
      console.error('Failed to send welcome email:', await resendRes.text())
    } else {
      console.log(`Free welcome email sent to ${email}`)
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Auth webhook error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
