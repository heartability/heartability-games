// POST /admin-reply-ticket
// Admin-only. Posts an admin reply into support_messages (the in-app system
// of record), emails the user via Resend, optionally updates ticket status
// (defaults to 'pending' — "we replied, waiting on them"), and audit-logs.
//
// Body: { ticketId: string, body: string, newStatus?: 'open'|'pending'|'resolved' }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/resend.ts";
import { requireAdmin, logAdminAction } from "../_shared/require-admin.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const VALID_STATUSES = ["open", "pending", "resolved"];

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = await requireAdmin(req, supabase);
  if (admin instanceof Response) return admin;

  try {
    const { ticketId, body, newStatus } = await req.json();
    if (!ticketId || !body || !body.trim()) {
      return new Response(JSON.stringify({ error: "ticketId and body are required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (newStatus && !VALID_STATUSES.includes(newStatus)) {
      return new Response(JSON.stringify({ error: "Invalid status." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("id", ticketId)
      .single();
    if (ticketError) throw ticketError;

    const { data: message, error: insertError } = await supabase
      .from("support_messages")
      .insert({ ticket_id: ticketId, sender: "admin", body: body.trim() })
      .select("*")
      .single();
    if (insertError) throw insertError;

    const statusToSet = newStatus ?? "pending";
    const { error: updateError } = await supabase
      .from("support_tickets")
      .update({ status: statusToSet, updated_at: new Date().toISOString() })
      .eq("id", ticketId);
    if (updateError) throw updateError;

    await sendEmail({
      to: ticket.email,
      subject: `Re: ${ticket.subject} — Heartability`,
      html: `
        <p>${body.trim().replace(/\n/g, "<br>")}</p>
        <p style="color:#999;font-size:13px;">Reply to this email if you have more questions.</p>
      `,
      replyTo: Deno.env.get("ADMIN_NOTIFY_EMAIL") ?? undefined,
    });

    await logAdminAction(supabase, {
      admin_user_id: admin.user.id,
      action: "reply_ticket",
      target_user_id: ticket.user_id ?? null,
      details: { ticketId, statusBefore: ticket.status, statusAfter: statusToSet },
    });

    return new Response(JSON.stringify({ ok: true, message, status: statusToSet }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Something went wrong." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
