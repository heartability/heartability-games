// POST /admin-moderate-media
// Admin-only. Takes down a media submission that went live automatically
// (media submissions have no approval queue) — either unpublishing it or
// deleting the submission outright. Audit-logs the action.
//
// Body: { id: string, action: 'unpublish'|'delete' }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { requireAdmin, logAdminAction } from "../_shared/require-admin.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const VALID_ACTIONS = ["unpublish", "delete"];

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
    const { id, action } = await req.json();
    if (!id || !VALID_ACTIONS.includes(action)) {
      return new Response(
        JSON.stringify({ error: `action must be one of: ${VALID_ACTIONS.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: before, error: beforeError } = await supabase
      .from("media_submissions")
      .select("submitted_by, is_public")
      .eq("id", id)
      .single();
    if (beforeError) throw beforeError;

    if (action === "unpublish") {
      const { error: updateError } = await supabase
        .from("media_submissions")
        .update({ is_public: false, is_author_public: false })
        .eq("id", id);
      if (updateError) throw updateError;
    } else {
      const { error: deleteError } = await supabase.from("media_submissions").delete().eq("id", id);
      if (deleteError) throw deleteError;
    }

    await logAdminAction(supabase, {
      admin_user_id: admin.user.id,
      action: "moderate_media_submission",
      target_user_id: before?.submitted_by ?? null,
      details: { id, moderationAction: action, wasPublic: before?.is_public ?? null },
    });

    return new Response(JSON.stringify({ ok: true, action }), {
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
