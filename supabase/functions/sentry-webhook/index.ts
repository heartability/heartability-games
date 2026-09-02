// POST /sentry-webhook
// Public endpoint — called by Sentry, not by our frontend. Configure this
// URL as the "Webhook URL" on a Sentry Internal Integration (Settings →
// Developer Settings → New Internal Integration), subscribed to the
// "Issue Alerts" webhook resource so it fires whenever an alert rule fires
// on a new/regressed error. Sentry signs every request with the
// integration's Client Secret — set that value as SENTRY_WEBHOOK_SECRET.
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto-provided by Supabase)
//   SENTRY_WEBHOOK_SECRET                    — Internal Integration's Client Secret

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const SENTRY_WEBHOOK_SECRET = Deno.env.get("SENTRY_WEBHOOK_SECRET") ?? "";

async function isValidSignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!SENTRY_WEBHOOK_SECRET || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SENTRY_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const digest = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return digest === signature;
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

  const rawBody = await req.text();
  const signature = req.headers.get("sentry-hook-signature");
  if (!(await isValidSignature(rawBody, signature))) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = JSON.parse(rawBody);

    // Sentry's "Issue Alerts" webhook shape nests event data under
    // data.event; the plain "Issue" resource webhook (status changes etc.)
    // nests it under data.issue instead. Read both defensively since we
    // can't be sure which resource triggered any given delivery.
    const event = body?.data?.event ?? {};
    const issue = body?.data?.issue ?? {};

    const sentryIssueId = String(event.issue_id ?? issue.id ?? "") || null;
    const title = event.title ?? issue.title ?? "Untitled error";
    const culprit = event.culprit ?? issue.culprit ?? null;
    const level = event.level ?? issue.level ?? null;
    const webUrl = event.web_url ?? issue.web_url ?? issue.permalink ?? null;
    const alertRule = body?.data?.issue_alert?.title ?? null;
    const eventTimestamp = event.timestamp ? new Date(event.timestamp * 1000).toISOString() : null;
    const status =
      issue.status ??
      (body.action === "resolved" ? "resolved" : body.action === "ignored" ? "ignored" : "unresolved");

    const row = {
      sentry_issue_id: sentryIssueId,
      title,
      culprit,
      level,
      alert_rule: alertRule,
      web_url: webUrl,
      status,
      event_timestamp: eventTimestamp,
      raw_payload: body,
    };

    // Upsert on sentry_issue_id so repeat alerts on the same issue update
    // one row instead of piling up duplicates; rows without an issue id
    // (shouldn't normally happen) just insert standalone.
    if (sentryIssueId) {
      const { error } = await supabase.from("client_errors").upsert(row, { onConflict: "sentry_issue_id" });
      if (error) throw error;
    } else {
      const { error } = await supabase.from("client_errors").insert(row);
      if (error) throw error;
    }

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
