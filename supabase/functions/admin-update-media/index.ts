// POST /admin-update-media
// Admin-only. Edits or removes a catalog entry from `media` itself (not a
// single review) — e.g. fixing a title that carries a long book subtitle,
// or deleting an entry entirely. Deleting cascades explicitly across every
// table that references media_id, since FK cascade isn't guaranteed to be
// configured on tables added over time (see wipe-user-data.ts for the same
// explicit-order pattern).
//
// Body: { id: string, action: 'update_title'|'delete', title?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { requireAdmin, logAdminAction } from "../_shared/require-admin.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const VALID_ACTIONS = ["update_title", "delete"];

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
    const { id, action, title } = await req.json();
    if (!id || !VALID_ACTIONS.includes(action)) {
      return new Response(
        JSON.stringify({ error: `action must be one of: ${VALID_ACTIONS.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: before, error: beforeError } = await supabase
      .from("media")
      .select("title")
      .eq("id", id)
      .single();
    if (beforeError) throw beforeError;

    if (action === "update_title") {
      const trimmedTitle = typeof title === "string" ? title.trim() : "";
      if (!trimmedTitle) {
        return new Response(JSON.stringify({ error: "title cannot be empty" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateError } = await supabase
        .from("media")
        .update({ title: trimmedTitle })
        .eq("id", id);
      if (updateError) throw updateError;

      await logAdminAction(supabase, {
        admin_user_id: admin.user.id,
        action: "update_media_title",
        details: { id, before: before?.title ?? null, after: trimmedTitle },
      });
    } else {
      const { data: arcs } = await supabase.from("media_story_arcs").select("id").eq("media_id", id);
      const arcIds = (arcs ?? []).map((a: { id: string }) => a.id);
      if (arcIds.length) {
        const { error: votesError } = await supabase.from("media_story_arc_votes").delete().in("arc_id", arcIds);
        if (votesError) throw votesError;
      }
      const { error: arcsError } = await supabase.from("media_story_arcs").delete().eq("media_id", id);
      if (arcsError) throw arcsError;

      const { error: savesError } = await supabase.from("media_saves").delete().eq("media_id", id);
      if (savesError) throw savesError;

      const { error: submissionsError } = await supabase.from("media_submissions").delete().eq("media_id", id);
      if (submissionsError) throw submissionsError;

      const { error: deleteError } = await supabase.from("media").delete().eq("id", id);
      if (deleteError) throw deleteError;

      await logAdminAction(supabase, {
        admin_user_id: admin.user.id,
        action: "delete_media",
        details: { id, title: before?.title ?? null },
      });
    }

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
