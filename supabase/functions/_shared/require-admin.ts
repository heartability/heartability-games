// Shared admin gate for every admin-* Edge Function. Verifies the caller's
// JWT and checks them against the admin_users allowlist server-side — this
// is the actual security boundary, not anything on the admin frontend.
//
// Usage:
//   const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
//   const admin = await requireAdmin(req, supabase);
//   if (admin instanceof Response) return admin;
//   // admin.user, admin.role are now available

import { corsHeaders } from "./cors.ts";

export interface AdminContext {
  user: { id: string; email?: string };
  role: string;
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function requireAdmin(
  req: Request,
  // deno-lint-ignore no-explicit-any
  supabase: any
): Promise<AdminContext | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonError(401, "Missing Authorization header.");

  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return jsonError(401, "Invalid or expired session.");

  const { data: adminRow, error: adminError } = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (adminError) {
    console.error("admin_users lookup failed:", adminError);
    return jsonError(403, "Not authorized.");
  }
  if (!adminRow) return jsonError(403, "Not authorized.");

  return { user: userData.user, role: adminRow.role };
}

export async function logAdminAction(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  opts: {
    admin_user_id: string;
    action: string;
    target_user_id?: string | null;
    // deno-lint-ignore no-explicit-any
    details?: Record<string, any>;
  }
): Promise<void> {
  const { error } = await supabase.from("admin_audit_log").insert({
    admin_user_id: opts.admin_user_id,
    action: opts.action,
    target_user_id: opts.target_user_id ?? null,
    details: opts.details ?? {},
  });
  if (error) console.error("Failed to write admin_audit_log:", error);
}
