// POST /admin-list-media
// Admin-only. Returns a paginated, filterable slice of `media` — the whole
// catalog, including entries with no review yet (curated/bulk-inserted
// directly, or saved-only) — each with its reviews (media_submissions)
// nested (service-role, so unpublished reviews are visible to admins even
// though public reads only ever go through the media_submissions_public view).
// Media submissions have no approval workflow — they go live immediately —
// so this is a moderation view, not a queue.
//
// Body: { visibility?: 'public'|'unpublished', page?: number, pageSize?: number }
// visibility filters to media with at least one review matching that
// is_public value; omitted, it returns the full catalog regardless of
// review status.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/require-admin.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const VALID_VISIBILITY = ["public", "unpublished"];

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
    const visibility: string | undefined = body.visibility && VALID_VISIBILITY.includes(body.visibility) ? body.visibility : undefined;
    const page: number = Number.isFinite(body.page) ? Math.max(0, body.page) : 0;
    const pageSize: number = Math.min(100, Number.isFinite(body.pageSize) ? body.pageSize : 25);
    const from = page * pageSize;
    const to = from + pageSize - 1;

    // With a visibility filter we need an inner join so only media that actually
    // has a matching review comes back; without one, a left embed so catalog-only
    // entries (no media_submissions row at all) still show up.
    let q = supabase
      .from("media")
      .select(visibility ? "*, media_submissions!inner(*)" : "*, media_submissions(*)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (visibility) q = q.eq("media_submissions.is_public", visibility === "public");

    const { data, error, count } = await q;
    if (error) throw error;

    const submitterIds = [
      ...new Set((data ?? []).flatMap((m) => (m.media_submissions ?? []).map((s) => s.submitted_by)).filter(Boolean)),
    ];
    const { data: profiles, error: profileError } = submitterIds.length
      ? await supabase.from("user-profiles").select("id, username").in("id", submitterIds)
      : { data: [], error: null };
    if (profileError) throw profileError;
    const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));

    const items = (data ?? []).map((m) => ({
      ...m,
      media_submissions: (m.media_submissions ?? []).map((s) => ({
        ...s,
        submitter_username: usernameById.get(s.submitted_by) ?? null,
      })),
    }));

    return new Response(JSON.stringify({ ok: true, items, total: count ?? 0, page, pageSize }), {
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
