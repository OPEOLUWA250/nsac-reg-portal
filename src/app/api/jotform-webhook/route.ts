import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { mapJotformSubmission } from "@/lib/jotform-mapping";
import { createAttendee, sendAttendeeQr, canResendQr } from "@/lib/attendee-service";

export const runtime = "nodejs";

// LEGACY: kept so registrations still arriving through Jotform keep working
// while we switch to our own form at /register. Remove the Jotform webhook
// (and this route) once the Jotform form is closed.
//
// Jotform posts submissions as multipart/form-data. Configure this URL as
// the webhook target in Jotform: Settings -> Integrations -> Webhooks.
//
// Fails closed: rows created here count as valid, paid tickets and get a QR
// email, so without JOTFORM_WEBHOOK_SECRET the route accepts nothing.
function secretMatches(provided: string | null, secret: string): boolean {
  if (!provided) return false;
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const secret = process.env.JOTFORM_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("Jotform webhook refused: JOTFORM_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!secretMatches(req.nextUrl.searchParams.get("secret"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const submissionId = form.get("submissionID")?.toString() ?? null;
  const formId = form.get("formID")?.toString() ?? null;
  const rawRequestStr = form.get("rawRequest")?.toString();

  if (!rawRequestStr) {
    return NextResponse.json(
      { error: "missing rawRequest in webhook payload" },
      { status: 400 }
    );
  }

  let rawRequest: Record<string, unknown>;
  try {
    rawRequest = JSON.parse(rawRequestStr);
  } catch {
    return NextResponse.json({ error: "invalid rawRequest JSON" }, { status: 400 });
  }

  const mapped = mapJotformSubmission(rawRequest);
  if (!mapped) {
    return NextResponse.json(
      {
        error:
          "could not extract name/email from submission — adjust mapJotformSubmission() in src/lib/jotform-mapping.ts",
      },
      { status: 422 }
    );
  }

  let outcome;
  try {
    outcome = await createAttendee({
      full_name: mapped.full_name,
      email: mapped.email,
      role: mapped.role,
      organization: mapped.organization,
      phone: mapped.phone,
      source: "jotform",
      jotform_submission_id: submissionId,
      jotform_form_id: formId,
      raw_payload: rawRequest,
    });
  } catch (error) {
    console.error("Failed to save Jotform attendee", error);
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }

  // Previously this route upserted and generated a NEW unique_code on every
  // Jotform retry, which silently invalidated the QR code already emailed.
  // Now: a retry leaves the record (and its QR) untouched.
  if (outcome.status === "created") {
    await sendAttendeeQr(outcome.attendee);
  } else if (outcome.status === "retry" && !outcome.attendee.qr_email_sent_at) {
    await sendAttendeeQr(outcome.attendee);
  } else if (outcome.status === "duplicate_email" && canResendQr(outcome.attendee)) {
    // Same person submitted the Jotform twice: one record, re-send their QR.
    await sendAttendeeQr(outcome.attendee);
  }

  return NextResponse.json({ ok: true, attendeeId: outcome.attendee.id, status: outcome.status });
}
