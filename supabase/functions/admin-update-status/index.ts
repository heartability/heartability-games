// POST /admin-update-status
// Admin-only. Updates status on a bug report or support ticket. Audit-logs
// the before/after status.
//
// Body: { type: 'bug'|'support', id: string, status: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { requireAdmin, logAdminAction } from "../_shared/require-admin.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const VALID_STATUSES: Record<string, string[]> = {
  bug: ["new", "investigating", "fixed", "wontfix"],
  support: ["open", "pending", "resolved"],
};

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
    const { type, id, status } = await req.json();
    if (!id || (type !== "bug" && type !== "support") || !VALID_STATUSES[type]?.includes(status)) {
      return new Response(
        JSON.stringify({ error: `type must be 'bug' or 'support' and status must be one of: ${VALID_STATUSES[type]?.join(", ") ?? "n/a"}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const table = type === "bug" ? "bug_reports" : "support_tickets";
    const { data: before, error: beforeError } = await supabase
      .from(table)
      .select("status, user_id")
      .eq("id", id)
      .single();
    if (beforeError) throw beforeError;

    const updatePayload: Record<string, unknown> = { status };
    if (type === "support") updatePayload.updated_at = new Date().toISOString();

    const { error: updateError } = await supabase.from(table).update(updatePayload).eq("id", id);
    if (updateError) throw updateError;

    await logAdminAction(supabase, {
      admin_user_id: admin.user.id,
      action: type === "bug" ? "update_bug_status" : "update_ticket_status",
      target_user_id: before?.user_id ?? null,
      details: { id, statusBefore: before?.status, statusAfter: status },
    });

    return new Response(JSON.stringify({ ok: true, status }), {
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
