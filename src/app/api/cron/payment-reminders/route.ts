import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { describeError } from "@/lib/describe-error";
import { getSettings } from "@/lib/settings-store";
import { isRegistrationOpen } from "@/lib/registration-config";
import { publicBaseUrl } from "@/lib/public-url";
import { listTickets } from "@/lib/ticket-store";
import { brandLogoPng } from "@/lib/ticket-image";
import { logActivity } from "@/lib/server/activity-log";
import { missingColumn, prepareReminder, recordReminder, sendReminder } from "@/lib/server/payment-reminders";
import { AUTOMATIC_SENDER, DEFAULT_TEMPLATES } from "@/lib/payment-reminder";
import type { Attendee } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// GET /api/cron/payment-reminders, once a day (vercel.json).
// When switched on in /admin → Settings, people still awaiting payment some
// days after registering get one reminder, in their language, with the
// default wording. Anyone already reminded (by an admin or by this) is left
// alone. Sends only when Vercel calls with CRON_SECRET, while registration
// is open, and once the reminder columns exist (otherwise it couldn't tell
// who was reminded and would email the same people every day).

const PER_RUN = 50;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET isn't set, so no reminders are sent." }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not allowed." }, { status: 401 });

  const headers = { "Cache-Control": "no-store" };
  const { autoReminders } = await getSettings();
  if (!autoReminders.enabled) return NextResponse.json({ ok: true, sent: 0, note: "Automatic reminders are off." }, { headers });
  if (!(await isRegistrationOpen())) return NextResponse.json({ ok: true, sent: 0, note: "Registration is closed." }, { headers });
  const baseUrl = publicBaseUrl();
  if (!baseUrl) return NextResponse.json({ ok: false, error: "PUBLIC_BASE_URL isn't set." }, { status: 500, headers });

  const cutoff = new Date(Date.now() - autoReminders.afterDays * 24 * 3600_000).toISOString();
  const { data, error } = await supabaseAdmin()
    .from("attendees")
    .select("*")
    .eq("payment_status", "pending")
    .lte("created_at", cutoff)
    .is("payment_reminder_sent_at", null)
    .order("created_at", { ascending: true })
    .limit(PER_RUN);
  if (error) {
    if (missingColumn(error)) {
      console.warn("Automatic payment reminders are on, but the payment reminders SQL hasn't been run: nothing sent.");
      return NextResponse.json({ ok: false, error: "Run the payment reminders SQL first." }, { status: 503, headers });
    }
    console.error(`Automatic reminders: couldn't read attendees: ${describeError(error)}`);
    return NextResponse.json({ ok: false }, { status: 500, headers });
  }

  const [tickets, logo] = await Promise.all([listTickets().catch(() => []), brandLogoPng().catch(() => null)]);
  let sent = 0;
  let failed = 0;
  for (const attendee of (data ?? []) as Attendee[]) {
    try {
      const prepared = await prepareReminder(attendee, { templates: DEFAULT_TEMPLATES }, tickets, baseUrl);
      if (!prepared.ok) continue;
      await sendReminder(attendee, prepared, { replyTo: autoReminders.replyTo, logoPngBuffer: logo });
      sent++;
      // If this can't be noted, stop: the next run would remind them again.
      if (!(await recordReminder(attendee, AUTOMATIC_SENDER))) {
        console.error(`Automatic reminders: couldn't record the reminder to ${attendee.id}; stopping this run.`);
        break;
      }
      await logActivity(null, {
        area: "registrations",
        action: "attendee.payment_reminder_sent",
        summary: `sent an automatic payment reminder to ${attendee.full_name}`,
        target: { type: "attendee", id: attendee.id },
        details: { email: attendee.email, automatic: true },
      });
    } catch (err) {
      failed++;
      console.error(`Automatic reminder to ${attendee.id} failed: ${describeError(err)}`);
    }
  }
  return NextResponse.json({ ok: failed === 0, sent, failed }, { headers });
}
