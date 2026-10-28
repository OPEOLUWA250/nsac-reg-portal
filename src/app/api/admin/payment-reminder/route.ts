import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adminRoute } from "@/lib/server/admin-auth";
import { describeError } from "@/lib/describe-error";
import { buildPaymentReminderEmail } from "@/lib/email";
import { brandLogoPng } from "@/lib/ticket-image";
import { listTickets } from "@/lib/ticket-store";
import { publicBaseUrl, toHttps } from "@/lib/public-url";
import { logActivity } from "@/lib/server/activity-log";
import { prepareReminder, recordReminder, sendReminder } from "@/lib/server/payment-reminders";
import { parseReminderInput, REMINDER_LIMITS, type ReminderLanguage } from "@/lib/payment-reminder";
import type { Attendee } from "@/lib/types";

export const runtime = "nodejs";
// Sending to everyone awaiting payment goes one email at a time.
export const maxDuration = 300;

// POST /api/admin/payment-reminder
//   { action: "preview" | "send", ids: [...], language?, templates: { en, fr },
//     replyTo, signedBy?, signerTitle?, copyToSender }
// Reminds people who registered but haven't paid, with a link back to
// payment at today's price (src/lib/server/payment-link.ts). Never sent on
// its own from here: an admin previews it in the dashboard first.
//   preview: the email for ids[0] (in `language` when given).
//   send:    one email per person, each in their language unless `language`
//            is given (one person). Returns how each one went.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Result =
  | { id: string; status: "sent"; attendee: Attendee | null }
  | { id: string; status: "paid" | "closed" | "missing" | "failed"; error: string };

const SKIPPED = {
  paid: "They have paid since.",
  closed: "Registration is closed, so the payment link wouldn't work.",
  missing: "This registration no longer exists.",
} as const;

export const POST = adminRoute(async (req: NextRequest, _context, session) => {
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const ids = Array.isArray(body?.ids) ? [...new Set((body.ids as unknown[]).filter((v): v is string => typeof v === "string" && UUID.test(v)))] : [];
  if ((action !== "preview" && action !== "send") || !ids.length || ids.length !== (body.ids as unknown[]).length) {
    return NextResponse.json({ error: "Choose who to remind." }, { status: 400 });
  }
  if (ids.length > REMINDER_LIMITS.people) {
    return NextResponse.json({ error: `Send to at most ${REMINDER_LIMITS.people} people at a time.` }, { status: 400 });
  }
  const language: ReminderLanguage | null = body.language === "en" || body.language === "fr" ? body.language : null;
  const parsed = parseReminderInput(body);
  if ("fields" in parsed) return NextResponse.json({ error: "Check the highlighted fields.", fields: parsed.fields }, { status: 400 });
  const input = parsed.value;

  const supabase = supabaseAdmin();
  const wanted = action === "preview" ? ids.slice(0, 1) : ids;
  const [{ data, error }, tickets] = await Promise.all([supabase.from("attendees").select("*").in("id", wanted), listTickets().catch(() => [])]);
  if (error) {
    console.error(`Payment reminder: couldn't read attendees: ${describeError(error)}`);
    return NextResponse.json({ error: "Couldn't load these registrations." }, { status: 500 });
  }
  const byId = new Map(((data ?? []) as Attendee[]).map((a) => [a.id, a]));
  const baseUrl = publicBaseUrl() ?? toHttps(req.nextUrl.origin);
  const wording = { templates: input.templates, signedBy: input.signedBy, signerTitle: input.signerTitle };
  // One person can be written to in another language than the one they registered in.
  const inLanguage = (a: Attendee) => (language ? { ...a, language } : a);

  try {
    if (action === "preview") {
      const attendee = byId.get(ids[0]);
      if (!attendee) return NextResponse.json({ error: SKIPPED.missing }, { status: 404 });
      const prepared = await prepareReminder(inLanguage(attendee), wording, tickets, baseUrl);
      if (!prepared.ok) return NextResponse.json({ error: SKIPPED[prepared.reason] }, { status: 409 });
      const { subject, html } = buildPaymentReminderEmail({ ...prepared.email, hasLogo: false });
      return NextResponse.json({ to: attendee.email, subject, html });
    }

    const logo = await brandLogoPng().catch(() => null);
    const results: Result[] = [];
    for (const id of ids) {
      const attendee = byId.get(id);
      if (!attendee) {
        results.push({ id, status: "missing", error: SKIPPED.missing });
        continue;
      }
      try {
        const prepared = await prepareReminder(inLanguage(attendee), wording, tickets, baseUrl);
        if (!prepared.ok) {
          results.push({ id, status: prepared.reason, error: SKIPPED[prepared.reason] });
          continue;
        }
        await sendReminder(attendee, prepared, {
          replyTo: input.replyTo,
          bcc: input.copyToSender ? input.replyTo : null,
          logoPngBuffer: logo,
        });
        const updated = await recordReminder(attendee, session.email);
        await logActivity(
          session,
          {
            area: "registrations",
            action: "attendee.payment_reminder_sent",
            summary: `sent a payment reminder to ${attendee.full_name}`,
            target: { type: "attendee", id },
            details: { email: attendee.email, language: prepared.language },
          },
          req
        );
        results.push({ id, status: "sent", attendee: updated });
      } catch (err) {
        console.error(`Payment reminder to ${id} failed: ${describeError(err)}`);
        results.push({ id, status: "failed", error: "The email didn't send." });
      }
    }
    const sent = results.filter((r) => r.status === "sent");
    // Sent, but the columns that remember it aren't there yet.
    const recorded = sent.every((r) => r.status === "sent" && r.attendee !== null);
    return NextResponse.json({ results, recorded });
  } catch (err) {
    console.error(`Payment reminder ${action} failed: ${describeError(err)}`);
    return NextResponse.json({ error: action === "preview" ? "Couldn't draw the preview." : "The reminders didn't send. Try again." }, { status: 500 });
  }
});
