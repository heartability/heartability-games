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

I hope you find everything you are looking for when you visit the castle. Here is what to do next:

1. Visit the Daily Matrix (heartability.com/matrix/daily) to track your progress through life
2. Explore the castle rooms for random games, chatrooms, and other surprises
3. Follow us on socials to keep up as we grow!

If your life doesn't look the way you imagined that just means you haven't reached your destination yet. You have to keep going, you have to keep trying. Heartability will help you keep charting your path.

When you're ready to go deeper, a paid membership unlocks the Dream Matrix and Cosmic Matrix, places for tracking your goals and your relationship with the cosmos. You can upgrade anytime at heartability.com/users/membership

Talk soon <3

Zoe Tinnes, Founder of Heartability`

    const freeWelcomeEmailHtml = `<p>Welcome to Heartability!</p>
<p>I hope you find everything you are looking for when you visit the castle. Here is what to do next:</p>
<p>1. Visit the <a href="https://heartability.com/matrix/daily">Daily Matrix</a> to track your progress through life<br>
2. Explore the castle rooms for random games, chatrooms, and other surprises<br>
3. Follow us on socials to keep up as we grow!</p>
<p>If your life doesn't look the way you imagined that just means you haven't reached your destination yet. You have to keep going, you have to keep trying. Heartability will help you keep charting your path.</p>
<p>When you're ready to go deeper, a <a href="https://heartability.com/users/membership">paid membership</a> unlocks the Dream Matrix and Cosmic Matrix, places for tracking your goals and your relationship with the cosmos. You can upgrade anytime at <a href="https://heartability.com/users/membership">heartability.com/users/membership</a></p>
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
        subject: 'Welcome to Heartability!',
        text: freeWelcomeEmail,
        html: freeWelcomeEmailHtml,
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
