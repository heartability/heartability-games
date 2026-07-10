// POST /submit-bug-report
// Public endpoint — no login required. Validates and inserts a bug report
// using the service role key, then notifies you and confirms to the reporter.
//
// Required env vars (set via `supabase secrets set`):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto-provided by Supabase)
//   RESEND_API_KEY
//   ADMIN_NOTIFY_EMAIL   — where new-bug notifications go

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/resend.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const ADMIN_NOTIFY_EMAIL = Deno.env.get("ADMIN_NOTIFY_EMAIL") ?? "hello@heartability.com";
const VALID_CATEGORIES = ["urgent", "minor"];

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

    // Honeypot — a hidden field named `website` that real users will never
    // fill in. If it's populated, silently pretend success so bots move on.
    if (body.website) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      email,
      category,
      description,
      page_url,
      steps_to_reproduce,
      screenshot_url,
    } = body;

    if (!email || !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: "A valid email is required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return new Response(JSON.stringify({ error: "Category must be 'urgent' or 'minor'." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!description || description.trim().length < 5) {
      return new Response(JSON.stringify({ error: "Please describe the bug." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Capture the reporter's user_id if they happened to send a valid
    // session token, but never require it.
    let user_id: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const { data } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      user_id = data?.user?.id ?? null;
    }

    const { data: inserted, error } = await supabase
      .from("bug_reports")
      .insert({
        email,
        user_id,
        category,
        description: description.trim(),
        page_url: page_url ?? null,
        steps_to_reproduce: steps_to_reproduce ?? null,
        screenshot_url: screenshot_url ?? null,
        browser_info: req.headers.get("User-Agent") ?? null,
      })
      .select("id")
      .single();

    if (error) throw error;

    const urgencyLabel = category === "urgent" ? "🔴 Urgent" : "🟡 Minor";
    await sendEmail({
      to: ADMIN_NOTIFY_EMAIL,
      subject: `[Bug — ${urgencyLabel}] New report from ${email}`,
      html: `
        <p><strong>${urgencyLabel} bug report</strong></p>
        <p><strong>From:</strong> ${email}</p>
        <p><strong>Page:</strong> ${page_url ?? "not provided"}</p>
        <p><strong>Description:</strong><br>${description}</p>
        <p><strong>Steps to reproduce:</strong><br>${steps_to_reproduce ?? "not provided"}</p>
        <p><strong>Report ID:</strong> ${inserted.id}</p>
      `,
      replyTo: email,
    });

    await sendEmail({
      to: email,
      subject: "We got your bug report — Heartability",
      html: `
        <p>Thanks for flagging this — it's in the queue and someone will look at it soon.</p>
        <p>If you think of anything else that would help us track it down, just reply to this email.</p>
      `,
    });

    return new Response(JSON.stringify({ ok: true, id: inserted.id }), {
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
