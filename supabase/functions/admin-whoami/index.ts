// POST /admin-whoami
// Admin-only. Trivial endpoint the admin frontend calls right after login to
// decide whether to render the console — a UI convenience only. The real
// security boundary is requireAdmin() running inside every other admin-*
// function, not this check.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/require-admin.ts";

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

  return new Response(JSON.stringify({ ok: true, email: admin.user.email, role: admin.role }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
