import { NextRequest, NextResponse } from "next/server";
import { publicBaseUrl } from "@/lib/public-url";
import { adminRoute } from "@/lib/server/admin-auth";
import { ownerEmails, parseAdminEmails } from "@/lib/server/admin-emails";
import { supabaseAuthConfig } from "@/lib/server/admin-roles";
import { getSettings, updateSettings } from "@/lib/settings-store";
import { registrationClosedByEnv } from "@/lib/registration-config";
import { availableTickets } from "@/lib/ticket-store";
import { describeError } from "@/lib/describe-error";
import { cleanAlertEmails, MAX_ALERT_EMAILS } from "@/lib/alert-emails";
import { logActivity } from "@/lib/server/activity-log";

export const runtime = "nodejs";

// A read-only summary of how the portal is configured (never the secrets
// themselves), shown on /admin/settings.
function systemStatus() {
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
  const from = process.env.EMAIL_FROM ?? "";
  return {
    payments: {
      configured: Boolean(stripeKey),
      // sk_ = full secret key, rk_ = restricted key.
      mode: /^(sk|rk)_live_/.test(stripeKey) ? "live" : stripeKey ? "test" : null,
      webhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    },
    email: {
      provider: process.env.SMTP_HOST ? `SMTP (${process.env.SMTP_HOST})` : process.env.RESEND_API_KEY ? "Resend" : null,
      sender: from || null,
      testSender: from.includes("resend.dev"),
    },
    security: {
      adminSignIn: Boolean(supabaseAuthConfig()),
      owners: ownerEmails().length,
      scannerAdminOnly: true,
      spamProtection: Boolean(process.env.TURNSTILE_SECRET_KEY),
    },
    keepAlive: Boolean(process.env.CRON_SECRET),
    publicUrl: publicBaseUrl(),
  };
}

export const GET = adminRoute(async (req: NextRequest) => {
  const [settings, onSale] = await Promise.all([
    getSettings(),
    availableTickets().catch(() => []),
  ]);
  return NextResponse.json({
    settings,
    closedByEnv: registrationClosedByEnv(),
    ticketsOnSale: onSale.length,
    status: systemStatus(),
    // Always emailed too, from the server setting (read-only on the page).
    alertEmailsFromEnv: parseAdminEmails(process.env.ADMIN_NOTIFY_EMAILS),
  });
});

// Body: { registrationOpen?: boolean, alertEmails?: string[] }
// The alert list holds who gets registrants' details by email: super admins only.
export const POST = adminRoute(async (req: NextRequest, _context: unknown, session) => {
  let body: { registrationOpen?: unknown; alertEmails?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (body.registrationOpen !== undefined && typeof body.registrationOpen !== "boolean") {
    return NextResponse.json({ error: "registrationOpen must be true or false" }, { status: 400 });
  }
  let alertEmails: string[] | undefined;
  if (body.alertEmails !== undefined) {
    if (session.role !== "super_admin") {
      return NextResponse.json({ error: "Only super admins can change who gets registration alerts." }, { status: 403 });
    }
    alertEmails = cleanAlertEmails(body.alertEmails) ?? undefined;
    if (!alertEmails) {
      return NextResponse.json({ error: `Enter up to ${MAX_ALERT_EMAILS} valid email addresses.` }, { status: 400 });
    }
  }
  try {
    const settings = await updateSettings({ registrationOpen: body.registrationOpen as boolean | undefined, alertEmails });
    if (alertEmails) console.info(`Registration alert list updated by ${session.email}: ${alertEmails.length} address(es)`);
    if (body.registrationOpen !== undefined) console.info(`Settings updated: registrationOpen=${settings.registrationOpen}`);
    if (body.registrationOpen !== undefined) {
      await logActivity(
        session,
        { area: "settings", action: settings.registrationOpen ? "registration.opened" : "registration.closed", summary: `${settings.registrationOpen ? "opened" : "closed"} registration` },
        req
      );
    }
    if (alertEmails) {
      await logActivity(
        session,
        {
          area: "settings",
          action: "alerts.changed",
          summary: `changed who gets registration alerts (${alertEmails.length} ${alertEmails.length === 1 ? "address" : "addresses"})`,
          details: { alertEmails },
        },
        req
      );
    }
    return NextResponse.json({ settings });
  } catch (err) {
    console.error(`Could not save settings: ${describeError(err)}`);
    return NextResponse.json(
      { error: "Could not save. Has the settings table been set up (20260929130000_settings.sql, see the README)?" },
      { status: 500 }
    );
  }
});
