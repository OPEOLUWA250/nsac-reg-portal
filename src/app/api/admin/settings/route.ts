import { NextRequest, NextResponse } from "next/server";
import { publicBaseUrl } from "@/lib/public-url";
import { adminRoute } from "@/lib/server/admin-auth";
import { ownerEmails } from "@/lib/server/admin-emails";
import { supabaseAuthConfig } from "@/lib/server/admin-roles";
import { getSettings, updateSettings } from "@/lib/settings-store";
import { registrationClosedByEnv } from "@/lib/registration-config";
import { availableTickets } from "@/lib/ticket-store";
import { describeError } from "@/lib/describe-error";

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
  });
});

// Body: { registrationOpen?: boolean }
export const POST = adminRoute(async (req: NextRequest) => {
  let body: { registrationOpen?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (body.registrationOpen !== undefined && typeof body.registrationOpen !== "boolean") {
    return NextResponse.json({ error: "registrationOpen must be true or false" }, { status: 400 });
  }
  try {
    const settings = await updateSettings({ registrationOpen: body.registrationOpen as boolean | undefined });
    console.info(`Settings updated: registrationOpen=${settings.registrationOpen}`);
    return NextResponse.json({ settings });
  } catch (err) {
    console.error(`Could not save settings: ${describeError(err)}`);
    return NextResponse.json(
      { error: "Could not save. Has the settings migration (20260929130000_settings.sql) been run?" },
      { status: 500 }
    );
  }
});
