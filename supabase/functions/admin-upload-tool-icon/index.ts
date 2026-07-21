// POST /admin-upload-tool-icon (multipart/form-data)
// Admin-only. Uploads an icon image straight to the tool-icons bucket using
// the service-role client (bypasses storage RLS entirely — the real
// boundary is requireAdmin() below, not a client-side storage policy, same
// as every other admin-* function) and persists the resulting public URL
// onto the tools row in the same request.
//
// Form fields: id (tool id), file (image blob)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { requireAdmin, logAdminAction } from "../_shared/require-admin.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const BUCKET = "tool-icons";

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
    const form = await req.formData();
    const id = form.get("id");
    const file = form.get("file");

    if (!id || typeof id !== "string" || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: "id and file are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const path = `${id}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || "image/png",
      upsert: false,
    });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const icon_url = pub?.publicUrl;

    const { error: updateError } = await supabase.from("tools").update({ icon_url }).eq("id", id);
    if (updateError) throw updateError;

    await logAdminAction(supabase, {
      admin_user_id: admin.user.id,
      action: "set_tool_icon",
      details: { id, icon_url },
    });

    return new Response(JSON.stringify({ ok: true, icon_url }), {
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
