// Thin wrapper around the Resend API, shared by any Edge Function that
// needs to send an email. Requires RESEND_API_KEY to be set as a Supabase
// function secret:
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxx

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS = Deno.env.get("RESEND_FROM_ADDRESS") ?? "Heartability <hello@heartability.com>";

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<void> {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set — skipping email send");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      reply_to: opts.replyTo,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Resend send failed:", res.status, text);
  }
}
