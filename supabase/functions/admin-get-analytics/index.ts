// POST /admin-get-analytics
// Admin-only, read-only. Aggregates platform health into summarized JSON —
// never ships raw rows to the browser. Results are cached in analytics_cache
// for 5 minutes so repeated dashboard loads don't re-run every aggregate.
//
// The user base is capped at ~100 accounts, so bounded per-table queries
// (recent window, selected columns only) aggregated here in the function are
// cheap; this is revisited with real SQL views/RPCs if the cap ever rises.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/require-admin.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const USER_CAP = 100;
const CACHE_KEY = "dashboard_v1";
const CACHE_TTL_MS = 5 * 60 * 1000;
const GAME_TABLES = ["dream_matrix", "cosmic_matrix", "daily_matrix", "cosmic_bingo"] as const;

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

async function computeAnalytics() {
  const now = new Date();
  const cutoff30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // ── Signups & membership ──────────────────────────────────
  const { data: profiles, error: profilesError } = await supabase
    .from("user-profiles")
    .select("created_at, membership_status, promo_free_year, billing_interval");
  if (profilesError) throw profilesError;

  const signupsByDay: Record<string, number> = {};
  for (const p of profiles ?? []) {
    if (p.created_at >= cutoff90) {
      const key = dayKey(p.created_at);
      signupsByDay[key] = (signupsByDay[key] ?? 0) + 1;
    }
  }

  // "dream" is one membership_status but three different origins we track
  // separately: the first-100 free-year promo, a real Stripe subscription
  // (monthly/yearly), or an admin comp / unrecognized-price fallback — see
  // [[project_membership_tier_rework_2026_08]].
  const membershipCounts = {
    free: 0,
    lifetime: 0,
    founding: 0,
    dreamPromo: 0,
    dreamMonthly: 0,
    dreamYearly: 0,
    dreamComp: 0,
    other: 0,
  };
  for (const p of profiles ?? []) {
    const status = p.membership_status || "free";
    if (status === "dream") {
      if (p.promo_free_year) membershipCounts.dreamPromo++;
      else if (p.billing_interval === "monthly") membershipCounts.dreamMonthly++;
      else if (p.billing_interval === "yearly") membershipCounts.dreamYearly++;
      else membershipCounts.dreamComp++;
    } else if (status in membershipCounts) {
      membershipCounts[status as keyof typeof membershipCounts]++;
    } else {
      membershipCounts.other++;
    }
  }

  const userCount = (profiles ?? []).length;

  // ── Game engagement ────────────────────────────────────────
  const gameEngagement = await Promise.all(
    GAME_TABLES.map(async (table) => {
      const totalRes = await supabase.from(table).select("id", { count: "exact", head: true });
      const recentRes = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .gte("created_at", cutoff30);
      return {
        table,
        total: totalRes.count ?? 0,
        last30Days: recentRes.count ?? 0,
      };
    })
  );

  // ── Support load ───────────────────────────────────────────
  const { data: tickets, error: ticketsError } = await supabase
    .from("support_tickets")
    .select("id, category, status, created_at");
  if (ticketsError) throw ticketsError;

  const ticketCategoryBreakdown: Record<string, number> = { billing: 0, account: 0, technical: 0, other: 0 };
  let openTicketCount = 0;
  for (const t of tickets ?? []) {
    if (t.category in ticketCategoryBreakdown) ticketCategoryBreakdown[t.category]++;
    if (t.status === "open" || t.status === "pending") openTicketCount++;
  }

  const { data: firstAdminReplies, error: repliesError } = await supabase
    .from("support_messages")
    .select("ticket_id, created_at")
    .eq("sender", "admin")
    .order("created_at", { ascending: true });
  if (repliesError) throw repliesError;

  const firstReplyByTicket = new Map<string, string>();
  for (const m of firstAdminReplies ?? []) {
    if (!firstReplyByTicket.has(m.ticket_id)) firstReplyByTicket.set(m.ticket_id, m.created_at);
  }
  const ticketById = new Map((tickets ?? []).map((t) => [t.id, t]));
  let totalReplyMs = 0;
  let repliedCount = 0;
  for (const [ticketId, replyAt] of firstReplyByTicket) {
    const ticket = ticketById.get(ticketId);
    if (!ticket) continue;
    totalReplyMs += new Date(replyAt).getTime() - new Date(ticket.created_at).getTime();
    repliedCount++;
  }
  const avgTimeToFirstReplyHours = repliedCount ? Math.round((totalReplyMs / repliedCount / 3600000) * 10) / 10 : null;

  const { data: bugs, error: bugsError } = await supabase
    .from("bug_reports")
    .select("id, category, status");
  if (bugsError) throw bugsError;

  let openUrgentBugs = 0;
  let openMinorBugs = 0;
  const bugSeverityCounts: Record<string, number> = { urgent: 0, minor: 0 };
  for (const b of bugs ?? []) {
    if (b.category in bugSeverityCounts) bugSeverityCounts[b.category]++;
    if (b.status === "new" || b.status === "investigating") {
      if (b.category === "urgent") openUrgentBugs++;
      else openMinorBugs++;
    }
  }

  return {
    generatedAt: now.toISOString(),
    headline: {
      userCount,
      userCap: USER_CAP,
      openUrgentBugs,
      openMinorBugs,
      openTicketCount,
    },
    signups: {
      byDay: signupsByDay,
    },
    membership: {
      counts: membershipCounts,
      userCount,
      userCap: USER_CAP,
    },
    gameEngagement,
    support: {
      openTicketCount,
      avgTimeToFirstReplyHours,
      categoryBreakdown: ticketCategoryBreakdown,
      bugSeverityCounts,
    },
  };
}

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
    const forceRefresh = body?.forceRefresh === true;

    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from("analytics_cache")
        .select("payload, computed_at")
        .eq("cache_key", CACHE_KEY)
        .maybeSingle();

      if (cached && Date.now() - new Date(cached.computed_at).getTime() < CACHE_TTL_MS) {
        return new Response(JSON.stringify({ ok: true, cached: true, ...cached.payload }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const payload = await computeAnalytics();

    await supabase
      .from("analytics_cache")
      .upsert({ cache_key: CACHE_KEY, payload, computed_at: new Date().toISOString() });

    return new Response(JSON.stringify({ ok: true, cached: false, ...payload }), {
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
