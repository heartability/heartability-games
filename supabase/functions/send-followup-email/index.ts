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

  const { data: users, error } = await sb
    .from('user-profiles')
    .select('id, email')
    .in('membership_status', ['basic', 'founding'])
    .eq('followup_email_sent', false)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())

  if (error) {
    console.error('Error fetching users:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  console.log(`Found ${users?.length ?? 0} users to send follow-up to`)

  const followupEmail = `When you play a video game, it is normal to fail until you learn the environment, gather resources, and build your skills.

The same thing is true in real life, but we tend to give ourselves much less grace in starting over. Trying something new typically requires you to fail a few times before you succeed. Most people give up before they reach success, which leads them to believe reaching their dreams is impossible. But you can do anything.

Depending on your dream, taking a step forward might change your entire life. Maybe you have to move, or go back to school, or do something you never expected. This naturally brings up emotions and scenarios you may have never encountered. Navigating those experiences can be difficult. It's often easier to ignore them, to return to the path you have already mapped out. But if you think back on your life, even if you don't have everything you want, the kind of life you are living, the hobbies you enjoy, the events you attend, the people you surround yourself with are all the result of you pursuing something you once desired. And now, it's normal to you. Anything you dream of can be like that.

Playing Heartability is about creating a record of your journey so that pattern recognition becomes easier. Playing regularly will reveal what emotions typically derail your progress with the Treasure Map game, what aspects of yourself are coming forward to support you through different environments in the Infinity Mirror game, and reveal where you might need more support in your life.

It's a way to track your progress as you move toward your dreams and new levels start to unlock.

Hit reply and let us know how it's going! I would love to hear from you <3

Zoe`

  for (const user of users ?? []) {
    if (!user.email) continue

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
