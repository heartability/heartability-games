import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (_req) => {
  const sb = createClient(
    Deno.env.get('SB_URL') ?? '',
    Deno.env.get('SB_SERVICE_ROLE_KEY') ?? ''
  )

  // Find paid members who signed up 7 days ago and haven't received the follow-up
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const start = new Date(sevenDaysAgo)
  start.setHours(0, 0, 0, 0)
  const end = new Date(sevenDaysAgo)
  end.setHours(23, 59, 59, 999)

  const { data: profiles, error } = await sb
    .from('user-profiles')
    .select('id, username')
    .in('membership_status', ['dream', 'founding'])
    .eq('followup_email_sent', false)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())

  if (error) {
    console.error('Error fetching users:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  console.log(`Found ${profiles?.length ?? 0} users to send follow-up to`)

  for (const profile of profiles ?? []) {
    // user-profiles has no email column — email lives in Supabase Auth.
    const { data: authData, error: authError } = await sb.auth.admin.getUserById(profile.id)
    if (authError || !authData?.user?.email) {
      console.error(`Could not resolve email for user ${profile.id}:`, authError)
      continue
    }
    const user = { id: profile.id, email: authData.user.email }
    const username = profile.username || 'there'

    const followupEmail = `Hey ${username},
When you play a video game, it is normal to fail until you learn the environment, gather resources, and build your skills. The same thing is true in real life, but we tend to give ourselves much less grace for starting over.

Trying something new is hard because the unavoidable truth is that it exposes you to failure. If you see this as a bad thing, you will give up on your dreams before you reach success. That doesn't mean your dreams are impossible, just that you thought they were, and maybe that was the right decision.

Depending on your dream, taking a step forward might change your entire life. Maybe it would require you to move, or go back to school, or do something you never expected. You have to decide what feels right to you, sometimes that means finding a new dream. That is okay too.

But if you think you can't do it, think back on how you imagined adulthood as a child. Even if you don't have everything you want, the way your life looks, the things that fill your home, the hobbies you enjoy, the events you attend, and the people you surround yourself with are all the result of you pursuing something you once desired. And now, it's all normal to you. Anything you dream of can be like that.

Playing Heartability is about creating a record of your journey so that pattern recognition becomes easier. As you evolve, the part of you that never changes becomes even clearer.

Hit reply and let us know how it's going! I would love to hear from you <3

Zoe Tinnes, Founder of Heartability

Got questions? Respond to this email or use the contact form https://www.heartability.com/legal/support.`

    const followupEmailHtml = `<p>Hey ${username},<br>
When you play a video game, it is normal to fail until you learn the environment, gather resources, and build your skills. The same thing is true in real life, but we tend to give ourselves much less grace for starting over.</p>
<p>Trying something new is hard because the unavoidable truth is that it exposes you to failure. If you see this as a bad thing, you will give up on your dreams before you reach success. That doesn't mean your dreams are impossible, just that you thought they were, and maybe that was the right decision.</p>
<p>Depending on your dream, taking a step forward might change your entire life. Maybe it would require you to move, or go back to school, or do something you never expected. You have to decide what feels right to you, sometimes that means finding a new dream. That is okay too.</p>
<p>But if you think you can't do it, think back on how you imagined adulthood as a child. Even if you don't have everything you want, the way your life looks, the things that fill your home, the hobbies you enjoy, the events you attend, and the people you surround yourself with are all the result of you pursuing something you once desired. And now, it's all normal to you. Anything you dream of can be like that.</p>
<p>Playing Heartability is about creating a record of your journey so that pattern recognition becomes easier. As you evolve, the part of you that never changes becomes even clearer.</p>
<p>Hit reply and let us know how it's going! I would love to hear from you &lt;3</p>
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
        subject: 'How is your journey going?',
        text: followupEmail,
        html: followupEmailHtml,
      }),
    })

    if (!resendRes.ok) {
      console.error(`Failed to send to ${user.email}:`, await resendRes.text())
      continue
    }

    // Mark as sent
    await sb
      .from('user-profiles')
      .update({ followup_email_sent: true })
      .eq('id', user.id)

    console.log(`Follow-up sent to ${user.email}`)
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
