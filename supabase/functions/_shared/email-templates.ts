// Shared email copy so the welcome email only lives in one place — used by
// stripe-webhook (on checkout completion) and admin-update-user's
// resend_welcome_email action.

export function welcomeEmailText(): string {
  return `Welcome to the Dream Membership!

You chose to listen to your heart today, and that means something. It's the first step to making your dreams come true. If you keep listening to that voice, your whole life will change. Anything is possible…you just have to imagine it.

Your benefits:
The Dream Matrix (heartability.com/matrix/dream) - track your goals over time
The Cosmic Matrix (heartability.com/matrix/cosmic) - track how astrology influences your life.

Investing in your dreams and taking the time to track your progress, not productivity, will change your life. It won't be easy, but when you start to consider giving up, visit the archive (heartability.com/matrix/archive). Remember how far you have already come. How many things have already changed. The world is infinite, and so are you.

Visit the Shipping Room (heartability.com/rooms/shipping) to learn more about future updates, including more rooms in the castle, a customized 2d side scrolling video game world rendered from your personal maps, collective media libraries of inspiration, and so much more. Your support makes that possible. Thank you for believing in yourself and for believing in Heartability — may we both be winners. ꩜

Talk soon <3

Zoe Tinnes, Founder of Heartability`;
}

export function welcomeEmailHtml(): string {
  return `<p>Welcome to the Dream Membership!</p>
<p>You chose to listen to your heart today, and that means something. It's the first step to making your dreams come true. If you keep listening to that voice, your whole life will change. Anything is possible…you just have to imagine it.</p>
<p>Your benefits:<br>
<a href="https://heartability.com/matrix/dream">The Dream Matrix</a> - track your goals over time<br>
<a href="https://heartability.com/matrix/cosmic">The Cosmic Matrix</a> - track how astrology influences your life.</p>
<p>Investing in your dreams and taking the time to track your progress, not productivity, will change your life. It won't be easy, but when you start to consider giving up, visit the <a href="https://heartability.com/matrix/archive">archive</a>. Remember how far you have already come. How many things have already changed. The world is infinite, and so are you.</p>
<p>Visit the <a href="https://heartability.com/rooms/shipping">Shipping Room</a> to learn more about future updates, including more rooms in the castle, a customized 2d side scrolling video game world rendered from your personal maps, collective media libraries of inspiration, and so much more. Your support makes that possible. Thank you for believing in yourself and for believing in Heartability — may we both be winners. ꩜</p>
<p>Talk soon &lt;3</p>
<p>Zoe Tinnes, Founder of Heartability</p>`;
}
