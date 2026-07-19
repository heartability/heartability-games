// POST /admin-digest-email
// Cron-triggered (Supabase pg_cron + pg_net), scheduled for 8am/8pm ET —
// not admin-authenticated the way admin-* dashboard functions are;
// verify_jwt gates it to callers with a valid Supabase key, same pattern as
// send-followup-email. Summarizes new signups, support tickets, and bug
// reports since the last run (default: a 12-hour lookback, matching the
// twice-daily schedule) plus a snapshot of open counts, and emails it to
// ADMIN_NOTIFY_EMAIL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/resend.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const ADMIN_NOTIFY_EMAIL = Deno.env.get("ADMIN_NOTIFY_EMAIL") ?? "hello@heartability.com";
const DEFAULT_LOOKBACK_HOURS = 12;

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

  try {
    const body = await req.json().catch(() => ({}));
    const lookbackHours = Number.isFinite(body?.hours) ? body.hours : DEFAULT_LOOKBACK_HOURS;
    const cutoff = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();

    const [signupsRes, ticketsRes, bugsRes, allProfilesRes, openTicketsRes, openBugsRes] = await Promise.all([
      supabase
        .from("user-profiles")
        .select("username, created_at, membership_status")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: true }),
      supabase
        .from("support_tickets")
        .select("email, category, subject, created_at")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: true }),
      supabase
        .from("bug_reports")
        .select("email, category, description, created_at")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: true }),
      supabase.from("user-profiles").select("membership_status"),
      supabase.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "pending"]),
      supabase.from("bug_reports").select("id", { count: "exact", head: true }).in("status", ["new", "investigating"]),
    ]);

    if (signupsRes.error) throw signupsRes.error;
    if (ticketsRes.error) throw ticketsRes.error;
    if (bugsRes.error) throw bugsRes.error;
    if (allProfilesRes.error) throw allProfilesRes.error;

    const signups = signupsRes.data ?? [];
    const tickets = ticketsRes.data ?? [];
    const bugs = bugsRes.data ?? [];

    const membershipCounts: Record<string, number> = { free: 0, basic: 0, founding: 0, other: 0 };
    for (const p of allProfilesRes.data ?? []) {
      const status = p.membership_status || "free";
      if (status in membershipCounts) membershipCounts[status]++;
      else membershipCounts.other++;
    }
    const totalUsers = (allProfilesRes.data ?? []).length;
    const openTickets = openTicketsRes.count ?? 0;
    const openBugs = openBugsRes.count ?? 0;

    const section = (title: string, rows: string[]) =>
      rows.length
        ? `<h3 style="margin:20px 0 8px;">${title} (${rows.length})</h3><ul style="margin:0;padding-left:18px;">${rows.join("")}</ul>`
        : `<h3 style="margin:20px 0 8px;">${title} (0)</h3><p style="margin:0;color:#888;">None since the last digest.</p>`;

    const signupRows = signups.map(
      (s) =>
        `<li>${escapeHtml(s.username ?? "unnamed user")} — ${escapeHtml(s.membership_status ?? "free")} — ${fmtTime(s.created_at)}</li>`
    );
    const ticketRows = tickets.map(
      (t) =>
        `<li>[${escapeHtml(t.category)}] ${escapeHtml(t.subject)} — ${escapeHtml(t.email ?? "unknown")} — ${fmtTime(t.created_at)}</li>`
    );
    const bugRows = bugs.map(
      (b) =>
        `<li>[${escapeHtml(b.category)}] ${escapeHtml((b.description ?? "").slice(0, 120))} — ${escapeHtml(b.email ?? "unknown")} — ${fmtTime(b.created_at)}</li>`
    );

    const label = new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    const html = `
      <p><strong>Heartability Digest — ${label} ET</strong></p>
      <p style="color:#555;">Covering the last ${lookbackHours} hours.</p>
      <h3 style="margin:20px 0 8px;">Snapshot</h3>
      <ul style="margin:0;padding-left:18px;">
        <li>${totalUsers} total users (free: ${membershipCounts.free}, basic: ${membershipCounts.basic}, founding: ${membershipCounts.founding})</li>
        <li>${openTickets} open support tickets</li>
        <li>${openBugs} open bug reports</li>
      </ul>
      ${section("New signups", signupRows)}
      ${section("New support tickets", ticketRows)}
      ${section("New bug reports", bugRows)}
    `;

    await sendEmail({
      to: ADMIN_NOTIFY_EMAIL,
      subject: `Heartability Digest — ${signups.length} signups, ${tickets.length} tickets, ${bugs.length} bugs`,
      html,
    });

    return new Response(
      JSON.stringify({ ok: true, signups: signups.length, tickets: tickets.length, bugs: bugs.length }),
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
