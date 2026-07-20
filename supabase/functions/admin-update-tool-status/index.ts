// POST /admin-update-tool-status
// Admin-only. Approves/rejects/resets a tool submission. Audit-logs the
// before/after status.
//
// Body: { id: string, status: 'pending'|'approved'|'rejected', rejection_reason?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { requireAdmin, logAdminAction } from "../_shared/require-admin.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const VALID_STATUSES = ["pending", "approved", "rejected"];

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
    const { id, status, rejection_reason } = await req.json();
    if (!id || !VALID_STATUSES.includes(status)) {
      return new Response(
        JSON.stringify({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: before, error: beforeError } = await supabase
      .from("tools")
      .select("status, submitted_by")
      .eq("id", id)
      .single();
    if (beforeError) throw beforeError;

    const updatePayload: Record<string, unknown> = {
      status,
      rejection_reason: status === "rejected" ? (rejection_reason ?? null) : null,
      approved_at: status === "approved" ? new Date().toISOString() : null,
    };

    const { error: updateError } = await supabase.from("tools").update(updatePayload).eq("id", id);
    if (updateError) throw updateError;

    await logAdminAction(supabase, {
      admin_user_id: admin.user.id,
      action: "update_tool_status",
      target_user_id: before?.submitted_by ?? null,
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
