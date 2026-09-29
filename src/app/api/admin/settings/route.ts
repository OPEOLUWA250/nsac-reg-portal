import { NextRequest, NextResponse } from "next/server";
import { publicBaseUrl } from "@/lib/public-url";
import { adminCodeRequired, isAdminAuthorized, isStaffAuthorized } from "@/lib/staff-auth";
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
      mode: stripeKey.startsWith("sk_live_") ? "live" : stripeKey ? "test" : null,
      webhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    },
    email: {
      provider: process.env.SMTP_HOST ? `SMTP (${process.env.SMTP_HOST})` : process.env.RESEND_API_KEY ? "Resend" : null,
      sender: from || null,
      testSender: from.includes("resend.dev"),
    },
    security: {
      staffCode: Boolean(process.env.STAFF_ACCESS_CODE),
      adminCode: Boolean(process.env.ADMIN_ACCESS_CODE),
      spamProtection: Boolean(process.env.TURNSTILE_SECRET_KEY),
    },
    publicUrl: publicBaseUrl(),
  };
}

export async function GET(req: NextRequest) {
  if (!isStaffAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const [settings, onSale] = await Promise.all([
    getSettings(),
    availableTickets().catch(() => []),
  ]);
  return NextResponse.json({
    settings,
    closedByEnv: registrationClosedByEnv(),
    ticketsOnSale: onSale.length,
    status: systemStatus(),
    adminCodeRequired: adminCodeRequired(),
  });
}

// Body: { registrationOpen?: boolean }
export async function POST(req: NextRequest) {
  if (!isStaffAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "Wrong admin code." }, { status: 403 });
  }
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
}
