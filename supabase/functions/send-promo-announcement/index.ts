import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// One-time announcement for the free-year signup challenge backfill. Run
// manually once (curl/Postman against the function URL) after running the
// backfill SQL that sets promo_free_year on existing accounts — emails each
// of them, then marks promo_email_sent so re-running this is a no-op for
// anyone already notified. New signups get their bonus email from
// auth-webhook instead, since they haven't been "existing users" yet.
serve(async (_req) => {
  const sb = createClient(
    Deno.env.get('SB_URL') ?? '',
    Deno.env.get('SB_SERVICE_ROLE_KEY') ?? ''
  )

  const { data: profiles, error } = await sb
    .from('user-profiles')
    .select('id, username')
    .eq('promo_free_year', true)
    .eq('promo_email_sent', false)

  if (error) {
    console.error('Error fetching promo users:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  console.log(`Found ${profiles?.length ?? 0} existing users to notify about the free-year promo`)

  let sent = 0
  for (const profile of profiles ?? []) {
    // user-profiles has no email column — email lives in Supabase Auth.
    const { data: authData, error: authError } = await sb.auth.admin.getUserById(profile.id)
    if (authError || !authData?.user?.email) {
      console.error(`Could not resolve email for user ${profile.id}:`, authError)
      continue
    }
    const user = { id: profile.id, email: authData.user.email }
    const username = profile.username || 'there'

    const announcementText = `Hey ${username},

Quick surprise: as one of the first 100 members, you are being upgraded to the Dream Membership for one full year!

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

    const announcementHtml = `<p>Hey ${username},</p>
<p>Quick surprise: as one of the first 100 members, you are being upgraded to the Dream Membership for one full year!</p>
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
        to: user.email,
        subject: 'Your free year of Dream membership starts now!',
        text: announcementText,
        html: announcementHtml,
      }),
    })

    if (!resendRes.ok) {
      console.error(`Failed to send to ${user.email}:`, await resendRes.text())
      continue
    }

    await sb.from('user-profiles').update({ promo_email_sent: true }).eq('id', user.id)
    sent++
    console.log(`Promo announcement sent to ${user.email}`)
  }

  return new Response(JSON.stringify({ received: true, sent }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
