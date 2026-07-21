// POST /admin-update-user
// Admin-only. Every supported edit is its own explicit action — never a
// generic "patch these columns" endpoint, so the audit log stays meaningful
// and nothing gets exposed here that shouldn't be admin-editable (auth
// credentials are deliberately NOT handled here — see stripe-webhook /
// account-settings.html's own Supabase Auth flows for those).
//
// Body: { userId: string, action: string, ...actionParams }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@13";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/resend.ts";
import { welcomeEmailHtml } from "../_shared/email-templates.ts";
import { requireAdmin, logAdminAction } from "../_shared/require-admin.ts";
import { wipeUserData } from "../_shared/wipe-user-data.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2023-10-16" });

const GAME_TABLES = ["dream_matrix", "cosmic_matrix", "daily_matrix", "cosmic_bingo"] as const;
type GameTable = (typeof GAME_TABLES)[number];

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") return jsonError(405, "Method not allowed");

  const admin = await requireAdmin(req, supabase);
  if (admin instanceof Response) return admin;

  try {
    const body = await req.json();
    const { userId, action } = body;
    if (!userId || !action) return jsonError(400, "userId and action are required.");

    const { data: profileBefore } = await supabase
      .from("user-profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    switch (action) {
      case "comp_membership": {
        const tier = body.tier;
        const months = Number.isFinite(body.months) ? body.months : 12;
        if (tier !== "dream" && tier !== "founding") return jsonError(400, "tier must be 'dream' or 'founding'.");

        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + months);

        const after = { membership_status: tier, membership_tier: tier, membership_expires_at: expiresAt.toISOString() };
        const { error } = await supabase.from("user-profiles").update(after).eq("id", userId);
        if (error) throw error;

        await logAdminAction(supabase, {
          admin_user_id: admin.user.id,
          action: "comp_membership",
          target_user_id: userId,
          details: { before: profileBefore, after },
        });
        return ok({ membership: after });
      }

      case "downgrade_membership": {
        const after = { membership_status: "free", membership_tier: null, membership_expires_at: null };
        const { error } = await supabase.from("user-profiles").update(after).eq("id", userId);
        if (error) throw error;

        await logAdminAction(supabase, {
          admin_user_id: admin.user.id,
          action: "downgrade_membership",
          target_user_id: userId,
          details: { before: profileBefore, after },
        });
        return ok({ membership: after });
      }

      case "reset_game_save": {
        const table = body.table as GameTable;
        if (!GAME_TABLES.includes(table)) {
          return jsonError(400, `table must be one of: ${GAME_TABLES.join(", ")}`);
        }
        const { error, count } = await supabase.from(table).delete({ count: "exact" }).eq("user_id", userId);
        if (error) throw error;

        await logAdminAction(supabase, {
          admin_user_id: admin.user.id,
          action: "reset_game_save",
          target_user_id: userId,
          details: { table, rowsDeleted: count ?? 0 },
        });
        return ok({ table, rowsDeleted: count ?? 0 });
      }

      case "flag_account": {
        const reason = (body.reason ?? "").trim();
        if (!reason) return jsonError(400, "reason is required to flag an account.");
        const after = { flagged: true, flag_reason: reason };
        const { error } = await supabase.from("user-profiles").update(after).eq("id", userId);
        if (error) throw error;

        await logAdminAction(supabase, {
          admin_user_id: admin.user.id,
          action: "flag_account",
          target_user_id: userId,
          details: { reason },
        });
        return ok({ flagged: true, flag_reason: reason });
      }

      case "unflag_account": {
        const after = { flagged: false, flag_reason: null };
        const { error } = await supabase.from("user-profiles").update(after).eq("id", userId);
        if (error) throw error;

        await logAdminAction(supabase, {
          admin_user_id: admin.user.id,
          action: "unflag_account",
          target_user_id: userId,
          details: {},
        });
        return ok({ flagged: false });
      }

      case "refund_payment": {
        const chargeId = body.chargeId;
        const reason = body.reason;
        if (!chargeId) return jsonError(400, "chargeId is required.");

        const refund = await stripe.refunds.create({
          charge: chargeId,
          reason: ["duplicate", "fraudulent", "requested_by_customer"].includes(reason) ? reason : undefined,
        });

        await logAdminAction(supabase, {
          admin_user_id: admin.user.id,
          action: "refund_payment",
          target_user_id: userId,
          details: { chargeId, refundId: refund.id, amount: refund.amount, reason: reason ?? null },
        });
        return ok({ refund: { id: refund.id, status: refund.status, amount: refund.amount } });
      }

      case "resend_welcome_email": {
        const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
        if (authError || !authData?.user?.email) return jsonError(404, "User email not found.");

        await sendEmail({
          to: authData.user.email,
          subject: "Welcome to the Dream Membership!",
          html: welcomeEmailHtml(),
        });

        await logAdminAction(supabase, {
          admin_user_id: admin.user.id,
          action: "resend_welcome_email",
          target_user_id: userId,
          details: {},
        });
        return ok({ sent: true });
      }

      case "revoke_sessions": {
        const { error } = await supabase.auth.admin.signOut(userId, "global");
        if (error) throw error;

        await logAdminAction(supabase, {
          admin_user_id: admin.user.id,
          action: "revoke_sessions",
          target_user_id: userId,
          details: {},
        });
        return ok({ revoked: true });
      }

      case "delete_account": {
        const { data: authData } = await supabase.auth.admin.getUserById(userId);
        const email = authData?.user?.email ?? null;
        const username = profileBefore?.username ?? null;

        // Anonymize chatroom messages rather than deleting them — matches
        // the self-serve delete-account flow, since chat is a shared space
        // other users are still looking at.
        if (username) {
          await supabase.from("chatroom").update({ name: "deleted account" }).eq("name", username);
        }

        await wipeUserData(supabase, userId);
        await supabase.from("user-profiles").delete().eq("id", userId);

        const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
        if (authDeleteError) throw authDeleteError;

        await logAdminAction(supabase, {
          admin_user_id: admin.user.id,
          action: "delete_account",
          target_user_id: null,
          details: { deletedUserId: userId, email, username },
        });
        return ok({ deleted: true });
      }

      default:
        return jsonError(400, `Unknown action: ${action}`);
    }
  } catch (err) {
    console.error(err);
    return jsonError(500, "Something went wrong.");
  }
});

function ok(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: true, ...payload }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
