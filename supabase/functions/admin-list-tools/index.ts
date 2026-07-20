// POST /admin-list-tools
// Admin-only. Returns a paginated, filterable slice of the tools table
// (service-role, so pending/rejected rows are visible to admins even though
// public RLS only allows status='approved').
//
// Body: { status?: 'pending'|'approved'|'rejected', page?: number, pageSize?: number }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/require-admin.ts";

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
    const body = await req.json().catch(() => ({}));
    const status: string | undefined = body.status && VALID_STATUSES.includes(body.status) ? body.status : undefined;
    const page: number = Number.isFinite(body.page) ? Math.max(0, body.page) : 0;
    const pageSize: number = Math.min(100, Number.isFinite(body.pageSize) ? body.pageSize : 25);
    const from = page * pageSize;
    const to = from + pageSize - 1;

    let q = supabase
      .from("tools")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (status) q = q.eq("status", status);

    const { data, error, count } = await q;
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, tools: data ?? [], total: count ?? 0, page, pageSize }), {
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
