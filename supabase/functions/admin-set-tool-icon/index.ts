// POST /admin-set-tool-icon
// Admin-only. Sets (or clears) the icon_url on a tool — the file itself is
// uploaded client-side straight to the tool-icons storage bucket by the
// admin's own authenticated session; this function only persists the
// resulting public URL onto the tools row (which regular RLS won't allow).
//
// Body: { id: string, icon_url: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { requireAdmin, logAdminAction } from "../_shared/require-admin.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

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
    const { id, icon_url } = await req.json();
    if (!id || typeof icon_url !== "string" || !icon_url) {
      return new Response(JSON.stringify({ error: "id and icon_url are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updateError } = await supabase.from("tools").update({ icon_url }).eq("id", id);
    if (updateError) throw updateError;

    await logAdminAction(supabase, {
      admin_user_id: admin.user.id,
      action: "set_tool_icon",
      details: { id, icon_url },
    });

    return new Response(JSON.stringify({ ok: true }), {
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
