// POST /admin-search-users
// Admin-only. Search auth.users by email substring (or exact user id),
// joined with user-profiles for membership fields. Also returns the current
// user count vs. the ~100-user platform cap so it can be surfaced in the UI.
//
// Body: { query: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/require-admin.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const USER_CAP = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const { query } = await req.json();
    const q = (query ?? "").trim();

    // Cap is small (~100 users) so a single wide page + in-memory filter is
    // simpler and cheaper than paging through the admin API's own search.
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listError) throw listError;

    const allUsers = listData.users ?? [];
    let matched = allUsers;
    if (q) {
      if (UUID_RE.test(q)) {
        matched = allUsers.filter((u) => u.id === q);
      } else {
        const needle = q.toLowerCase();
        matched = allUsers.filter((u) => (u.email ?? "").toLowerCase().includes(needle));
      }
    }
    matched = matched.slice(0, 50);

    const ids = matched.map((u) => u.id);
    const { data: profiles, error: profileError } = ids.length
      ? await supabase
          .from("user-profiles")
          .select("id, username, membership_status, membership_tier, flagged")
          .in("id", ids)
      : { data: [], error: null };
    if (profileError) throw profileError;

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    const items = matched.map((u) => {
      const profile = profileById.get(u.id);
      return {
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        username: profile?.username ?? null,
        membership_status: profile?.membership_status ?? "free",
        membership_tier: profile?.membership_tier ?? null,
        flagged: profile?.flagged ?? false,
      };
    });

    return new Response(
      JSON.stringify({ ok: true, items, userCount: allUsers.length, userCap: USER_CAP }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(err);
    // TEMP: surfacing the real error message for debugging — revert to a
    // generic message once the search issue is diagnosed.
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
