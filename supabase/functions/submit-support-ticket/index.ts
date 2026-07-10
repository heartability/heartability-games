// POST /submit-support-ticket
// Public endpoint — no login required, but email is mandatory so there's a
// reply channel. Creates a ticket + its first message, notifies you, and
// confirms to the user.
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
// ADMIN_NOTIFY_EMAIL

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/resend.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const ADMIN_NOTIFY_EMAIL = Deno.env.get("ADMIN_NOTIFY_EMAIL") ?? "hello@heartability.com";
const VALID_CATEGORIES = ["billing", "account", "technical", "other"];

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();

    if (body.website) {
      // honeypot — silently accept without doing anything
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, category, subject, message } = body;

    if (!email || !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: "A valid email is required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return new Response(
        JSON.stringify({ error: "Category must be one of: billing, account, technical, other." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!subject || subject.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Please add a short subject." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!message || message.trim().length < 5) {
      return new Response(JSON.stringify({ error: "Please describe what's going on." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let user_id: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const { data } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      user_id = data?.user?.id ?? null;
    }

    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .insert({
        email,
        user_id,
        category,
        subject: subject.trim(),
      })
      .select("id")
      .single();

    if (ticketError) throw ticketError;

    const { error: messageError } = await supabase.from("support_messages").insert({
      ticket_id: ticket.id,
      sender: "user",
      body: message.trim(),
    });

    if (messageError) throw messageError;

    const categoryLabel: Record<string, string> = {
      billing: "💳 Billing",
      account: "👤 Account",
      technical: "🛠 Technical",
      other: "✉️ Other",
    };

    await sendEmail({
      to: ADMIN_NOTIFY_EMAIL,
      subject: `[Support — ${categoryLabel[category]}] ${subject}`,
      html: `
        <p><strong>${categoryLabel[category]} ticket</strong></p>
        <p><strong>From:</strong> ${email}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong><br>${message}</p>
        <p><strong>Ticket ID:</strong> ${ticket.id}</p>
      `,
      replyTo: email,
    });

    await sendEmail({
      to: email,
      subject: `We got your message — Heartability`,
      html: `
        <p>Thanks for reaching out — your ticket is in and someone will reply as soon as they can.</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p>Feel free to reply to this email if you want to add anything.</p>
      `,
    });

    return new Response(JSON.stringify({ ok: true, id: ticket.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
