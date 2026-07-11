// POST /admin-get-user-detail
// Admin-only. Full detail for one user: auth info, membership + recent
// Stripe payments (for the refund action), summarized game activity (counts
// + last-played, never raw jsonb rows), and any bug reports / support
// tickets tied to their user_id.
//
// Body: { userId: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@13";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/require-admin.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2023-10-16" });

// Tables that store per-user game save state — kept as an explicit allowlist
// so this (and admin-update-user's reset action) never touches an arbitrary
// table name.
const GAME_TABLES = ["dream_matrix", "cosmic_matrix", "daily_matrix", "cosmic_bingo"] as const;

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
    const { userId } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: "userId is required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "User not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authUser = authData.user;

    const { data: profile, error: profileError } = await supabase
      .from("user-profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;

    let recentPayments: unknown[] = [];
    if (profile?.stripe_customer_id) {
      try {
        const charges = await stripe.charges.list({ customer: profile.stripe_customer_id, limit: 10 });
        recentPayments = charges.data.map((c) => ({
          id: c.id,
          amount: c.amount,
          currency: c.currency,
          status: c.status,
          refunded: c.refunded,
          amount_refunded: c.amount_refunded,
          created: c.created,
          description: c.description,
        }));
      } catch (stripeErr) {
        console.error("Stripe charge lookup failed:", stripeErr);
      }
    }

    const activity = await Promise.all(
      GAME_TABLES.map(async (table) => {
        const { data, error, count } = await supabase
          .from(table)
          .select("created_at", { count: "exact" })
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) {
          console.error(`activity summary failed for ${table}:`, error);
          return { table, entries: 0, lastPlayed: null };
        }
        return { table, entries: count ?? 0, lastPlayed: data?.[0]?.created_at ?? null };
      })
    );

    const { data: bugReports, error: bugError } = await supabase
      .from("bug_reports")
      .select("id, category, description, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (bugError) throw bugError;

    const { data: supportTickets, error: ticketError } = await supabase
      .from("support_tickets")
      .select("id, category, subject, status, priority, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (ticketError) throw ticketError;

    return new Response(
      JSON.stringify({
        ok: true,
        account: {
          id: authUser.id,
          email: authUser.email,
          created_at: authUser.created_at,
          last_sign_in_at: authUser.last_sign_in_at,
          email_confirmed_at: authUser.email_confirmed_at,
        },
        membership: {
          profile: profile ?? null,
          recentPayments,
        },
        activity,
        support: {
          bugReports: bugReports ?? [],
          supportTickets: supportTickets ?? [],
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Something went wrong." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
