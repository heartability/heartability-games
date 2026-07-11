// POST /admin-list-tickets
// Admin-only. Returns a paginated, filterable slice of bug_reports and/or
// support_tickets. Never returns the whole table.
//
// Body: { type: 'all'|'bug'|'support', status?: string, category?: string,
//          page?: number, pageSize?: number }

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

  try {
    const body = await req.json().catch(() => ({}));
    const type: string = body.type ?? "all";
    const status: string | undefined = body.status || undefined;
    const category: string | undefined = body.category || undefined;
    const page: number = Number.isFinite(body.page) ? Math.max(0, body.page) : 0;
    const pageSize: number = Math.min(100, Number.isFinite(body.pageSize) ? body.pageSize : 25);
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const results: { bugs: unknown[]; support: unknown[]; bugsTotal: number; supportTotal: number } = {
      bugs: [],
      support: [],
      bugsTotal: 0,
      supportTotal: 0,
    };

    if (type === "all" || type === "bug") {
      let q = supabase
        .from("bug_reports")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (status) q = q.eq("status", status);
      if (category) q = q.eq("category", category);
      const { data, error, count } = await q;
      if (error) throw error;
      results.bugs = data ?? [];
      results.bugsTotal = count ?? 0;
    }

    if (type === "all" || type === "support") {
      let q = supabase
        .from("support_tickets")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (status) q = q.eq("status", status);
      if (category) q = q.eq("category", category);
      const { data, error, count } = await q;
      if (error) throw error;
      results.support = data ?? [];
      results.supportTotal = count ?? 0;
    }

    return new Response(JSON.stringify({ ok: true, ...results, page, pageSize }), {
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
