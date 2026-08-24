import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Free-year signup challenge: the first 100 people to sign up get a full
// year of "dream" membership auto-granted, no opt-in click needed.
// promo_free_year tracks total grants so this stays capped at 100 even if
// the general signup cap (USER_CAP in admin-search-users/admin-get-analytics)
// is later raised. Pre-existing accounts are backfilled separately via SQL
// + the send-promo-announcement function — see users/membership.html for
// the "welcome bonus" popup shown to fresh signups.
const PROMO_CAP = 100

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
    const userId = payload.record?.id
    if (!email) {
      return new Response(JSON.stringify({ error: 'No email found' }), { status: 400 })
    }

    const sb = createClient(
      Deno.env.get('SB_URL') ?? '',
      Deno.env.get('SB_SERVICE_ROLE_KEY') ?? ''
    )

    let username = 'there'
    let gotBonus = false
    if (userId) {
      const [{ data: profile }, { count }] = await Promise.all([
        sb.from('user-profiles').select('username').eq('id', userId).single(),
        sb.from('user-profiles').select('id', { count: 'exact', head: true }).eq('promo_free_year', true),
      ])

      if (profile?.username) username = profile.username

      if ((count ?? 0) < PROMO_CAP) {
        const expiresAt = new Date()
        expiresAt.setFullYear(expiresAt.getFullYear() + 1)

        const { error: grantError } = await sb.from('user-profiles').update({
          membership_status:     'dream',
          membership_tier:       'dream',
          membership_expires_at: expiresAt.toISOString(),
          promo_free_year:       true,
        }).eq('id', userId)

        if (grantError) console.error('Error granting free-year promo:', grantError)
        else gotBonus = true
      }
    }

    const freeWelcomeEmail = `Hey ${username},
You have entered a new world. From this point forward, you will never look at the wellness industry the same. You can stop searching for the perfect diet or exercise routine and start learning how to play the game of life.

In this human body, you are not supposed to feel good all of the time. As long as you are alive, your state of being will be in flux. You will feel perfect, and then you will get hungry. Or tired. That is not a failure, it's life. You don't need to learn how to feel good all the time, you need to learn how to respond to how you're feeling.

Have you ever played The Sims? They need constant maintenance to stay alive, and even more to stay in the green. If you start to feel like a dying sim, see where your heart meter sits. If it's lower than normal, figure out where you need help and then allow yourself a minute to refuel.

Of all the games in the castle, Bingo is definitely the collective favorite. You can play it freely in the game room, but in the Daily Matrix you can track your daily score along with a map of your day, your current archetype and any important discoveries by adding photos and notes to your matrix. If you want to reflect on how you have been feeling over time, you can view these trends in the Matrix Archive. Again, the goal is not to be perfect, but to create a record of how you have been feeling lately.

When you're ready to go deeper, a paid membership unlocks the Dream Matrix and the Cosmic Matrix. You can upgrade anytime at heartability.com/users/membership.

Until next time,

Zoe Tinnes, Founder of Heartability

Got questions? Respond to this email or use the contact form https://www.heartability.com/legal/support.`

    const freeWelcomeEmailHtml = `<p>Hey ${username},<br>
You have entered a new world. From this point forward, you will never look at the wellness industry the same. You can stop searching for the perfect diet or exercise routine and start learning how to play the game of life.</p>
<p>In this human body, you are not supposed to feel good all of the time. As long as you are alive, your state of being will be in flux. You will feel perfect, and then you will get hungry. Or tired. That is not a failure, it's life. You don't need to learn how to feel good all the time, you need to learn how to respond to how you're feeling.</p>
<p>Have you ever played The Sims? They need constant maintenance to stay alive, and even more to stay in the green. If you start to feel like a dying sim, see where your heart meter sits. If it's lower than normal, figure out where you need help and then allow yourself a minute to refuel.</p>
<p>Of all the games in the castle, Bingo is definitely the collective favorite. You can play it freely in the game room, but in the <a href="https://heartability.com/matrix/daily">Daily Matrix</a> you can track your daily score along with a map of your day, your current archetype and any important discoveries by adding photos and notes to your matrix. If you want to reflect on how you have been feeling over time, you can view these trends in the <a href="https://heartability.com/matrix/archive">Matrix Archive</a>. Again, the goal is not to be perfect, but to create a record of how you have been feeling lately.</p>
<p>When you're ready to go deeper, a paid membership unlocks the <a href="https://heartability.com/matrix/dream">Dream Matrix</a> and the <a href="https://heartability.com/matrix/cosmic">Cosmic Matrix</a>. You can upgrade anytime at <a href="https://heartability.com/users/membership">heartability.com/users/membership</a>.</p>
<p>Until next time,</p>
<p>Zoe Tinnes, Founder of Heartability</p>
<p>Got questions? Respond to this email or use the <a href="https://www.heartability.com/legal/support">contact form</a>.</p>`

    const bonusWelcomeEmail = `Hey ${username},

Congratulations! As one of the first 100 members, you are being upgraded to the Dream Membership for one full year!

Your early support means so much. Releasing this game is a huge dream of mine coming true and it is so exciting to finally see people interacting with it! That being said, if there is anything that doesn't work or make sense to you, please don't hesitate to reach out.

The Dream Membership unlocks:

1. The Dream Matrix for tracking your goals over time
2. The Cosmic Matrix for tracking your relationship to the cosmos
3. Of course, everything in the free tier too… the Daily Matrix, a customizable castle bedroom, chatrooms, a collective media library, and so much more coming soon.

If you take the time to track your emotional progress rather than focusing on productivity, chasing your dreams will change your life. I'm not saying it will be easy, I'm not even saying it will come true. But something will come true, because we live in a world of cause and effect. If you happen to fail, at least with Heartability you can look back on your journey and understand the steps you took to get there. Once you see where things went wrong, you can try again, or enter a new portal — start a new dream. The point is, with Heartability, there is always a way forward.

If you start to consider giving up, visit your Treasure Map and remember how far you have already come and how many things have already changed. If it doesn't look the way you imagined, that just means this isn't the end of your journey. You have to keep going. Maybe you need to dream a new dream. You don't fail until you give up, and until then, you just have to keep trying…and tracking your progress on Heartability.

TLDR… You can do ANYTHING. Here's how:

1. Visit the Dream Matrix and create a map for a dream you have been trying to chase but it feels like you keep getting lost.
2. Every time you take a step toward your dream, make an entry.
3. When you feel like you have failed, look back at your matrix and reflect on where you could move differently.
4. If you notice an energy that feels out of this world messing with you ("oh, of course the full moon is this week"), visit the Cosmic Matrix and track your relationship with the planets and uncover their influence on your life.

That's all for now, until next time.

Zoe Tinnes, Founder of Heartability

Got questions? Respond to this email or use the contact form https://www.heartability.com/legal/support.`

    const bonusWelcomeEmailHtml = `<p>Hey ${username},</p>
<p>Congratulations! As one of the first 100 members, you are being upgraded to the Dream Membership for one full year!</p>
<p>Your early support means so much. Releasing this game is a huge dream of mine coming true and it is so exciting to finally see people interacting with it! That being said, if there is anything that doesn't work or make sense to you, please don't hesitate to reach out.</p>
<p>The Dream Membership unlocks:<br>
1. The <a href="https://heartability.com/matrix/dream">Dream Matrix</a> for tracking your goals over time<br>
2. The <a href="https://heartability.com/matrix/cosmic">Cosmic Matrix</a> for tracking your relationship to the cosmos<br>
3. Of course, everything in the free tier too… the <a href="https://heartability.com/matrix/daily">Daily Matrix</a>, a customizable castle bedroom, chatrooms, a collective media library, and so much more coming soon.</p>
<p>If you take the time to track your emotional progress rather than focusing on productivity, chasing your dreams will change your life. I'm not saying it will be easy, I'm not even saying it will come true. But something will come true, because we live in a world of cause and effect. If you happen to fail, at least with Heartability you can look back on your journey and understand the steps you took to get there. Once you see where things went wrong, you can try again, or enter a new portal — start a new dream. The point is, with Heartability, there is always a way forward.</p>
<p>If you start to consider giving up, visit your <a href="https://heartability.com/rooms/game-room">Treasure Map</a> and remember how far you have already come and how many things have already changed. If it doesn't look the way you imagined, that just means this isn't the end of your journey. You have to keep going. Maybe you need to dream a new dream. You don't fail until you give up, and until then, you just have to keep trying…and tracking your progress on Heartability.</p>
<p>TLDR… You can do ANYTHING. Here's how:<br>
1. Visit the Dream Matrix and create a map for a dream you have been trying to chase but it feels like you keep getting lost.<br>
2. Every time you take a step toward your dream, make an entry.<br>
3. When you feel like you have failed, look back at your matrix and reflect on where you could move differently.<br>
4. If you notice an energy that feels out of this world messing with you ("oh, of course the full moon is this week"), visit the Cosmic Matrix and track your relationship with the planets and uncover their influence on your life.</p>
<p>That's all for now, until next time.</p>
<p>Zoe Tinnes, Founder of Heartability</p>
<p>Got questions? Respond to this email or use the <a href="https://www.heartability.com/legal/support">contact form</a>.</p>`

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Zoe at Heartability <hello@heartability.com>',
        to: email,
        subject: gotBonus ? 'Your free year of Dream membership starts now!' : 'Welcome to Heartability!',
        text: gotBonus ? bonusWelcomeEmail : freeWelcomeEmail,
        html: gotBonus ? bonusWelcomeEmailHtml : freeWelcomeEmailHtml,
      }),
    })

    if (!resendRes.ok) {
      console.error('Failed to send welcome email:', await resendRes.text())
    } else {
      console.log(`${gotBonus ? 'Bonus' : 'Free'} welcome email sent to ${email}`)
    }

    return new Response(JSON.stringify({ received: true, gotBonus }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Auth webhook error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
