// Shared email copy so the welcome email only lives in one place — used by
// stripe-webhook (on checkout completion) and admin-update-user's
// resend_welcome_email action.

export function welcomeEmailText(username?: string): string {
  const name = username || 'there'
  return `Hey ${name},

You did it! A dream membership is an investment in yourself. You are telling your subconscious that you are ready to take your crazy little ideas a little more seriously. I promise if you take the time to track your emotional progress, not productivity, chasing your dreams will change your life. I'm not saying it will be easy, I'm not even saying it will come true. But something will come true, because we live in a world of cause and effect. If you happen to fail, at least with Heartability you can look back on your journey and understand the steps you took to get there. Once you see where things went wrong, you can try again, or enter a new portal — start a new dream. The point is, with Heartability, there is always a way forward.

When you start to consider giving up, visit your Treasure Map and remember how far you have already come and how many things have already changed. If it doesn't look the way you imagined, that just means this isn't the end of your journey. You have to keep going. Maybe you need to dream a new dream. You don't fail until you give up, and until then, you just have to keep trying…and tracking your progress on Heartability.

TLDR… You can do ANYTHING. Here's how:

1. Visit the Dream Matrix and create a map for a dream you have been trying to chase but it feels like you keep getting lost.
2. Every time you take a step toward your dream, make an entry.
3. When you feel like you have failed, look back at your matrix and reflect on where you could move differently.
4. If you notice an energy that feels out of this world messing with you ("oh, of course the full moon is this week"), visit the Cosmic Matrix and track your relationship with the planets and uncover their influence on your life.

That's all for now, until next time.

Zoe Tinnes, Founder of Heartability

Got questions? Respond to this email or use the contact form https://www.heartability.com/legal/support.`;
}

export function welcomeEmailHtml(username?: string): string {
  const name = username || 'there'
  return `<p>Hey ${name},</p>
<p>You did it! A dream membership is an investment in yourself. You are telling your subconscious that you are ready to take your crazy little ideas a little more seriously. I promise if you take the time to track your emotional progress, not productivity, chasing your dreams will change your life. I'm not saying it will be easy, I'm not even saying it will come true. But something will come true, because we live in a world of cause and effect. If you happen to fail, at least with Heartability you can look back on your journey and understand the steps you took to get there. Once you see where things went wrong, you can try again, or enter a new portal — start a new dream. The point is, with Heartability, there is always a way forward.</p>
<p>When you start to consider giving up, visit your <a href="https://heartability.com/rooms/game-room">Treasure Map</a> and remember how far you have already come and how many things have already changed. If it doesn't look the way you imagined, that just means this isn't the end of your journey. You have to keep going. Maybe you need to dream a new dream. You don't fail until you give up, and until then, you just have to keep trying…and tracking your progress on Heartability.</p>
<p>TLDR… You can do ANYTHING. Here's how:<br>
1. Visit the <a href="https://heartability.com/matrix/dream">Dream Matrix</a> and create a map for a dream you have been trying to chase but it feels like you keep getting lost.<br>
2. Every time you take a step toward your dream, make an entry.<br>
3. When you feel like you have failed, look back at your matrix and reflect on where you could move differently.<br>
4. If you notice an energy that feels out of this world messing with you ("oh, of course the full moon is this week"), visit the <a href="https://heartability.com/matrix/cosmic">Cosmic Matrix</a> and track your relationship with the planets and uncover their influence on your life.</p>
<p>That's all for now, until next time.</p>
<p>Zoe Tinnes, Founder of Heartability</p>
<p>Got questions? Respond to this email or use the <a href="https://www.heartability.com/legal/support">contact form</a>.</p>`;
}
