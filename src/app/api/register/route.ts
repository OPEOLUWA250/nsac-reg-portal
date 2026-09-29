import { NextRequest, NextResponse } from "next/server";
import { publicBaseUrl, toHttps } from "@/lib/public-url";
import { validateRegistration } from "@/lib/registration-fields";
import { verifyTurnstile } from "@/lib/turnstile";
import { createAttendee, sendAttendeeQr, canResendQr } from "@/lib/attendee-service";
import { isRegistrationOpen } from "@/lib/registration-config";
import { createCheckoutSession } from "@/lib/payments";
import { availableTickets } from "@/lib/ticket-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Attendee } from "@/lib/types";
import { describeError } from "@/lib/describe-error";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 20_000;

const PASSPORT_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function baseUrl(req: NextRequest): string {
  return publicBaseUrl() ?? toHttps(req.nextUrl.origin);
}

// Public registration endpoint used by the form on / (replaces the Jotform form).
//
// Responses:
//   200 { status: "payment_required", checkoutUrl, passportUploadUrl? }
//        → browser uploads the passport (if any), then goes to Stripe.
//   200 { status: "already_registered" }   (QR re-emailed to the address on file)
//   400 { error: "validation", fields }     (field -> error code)
//   403 { error: "spam_check_failed" }
//   409 { error: "registration_closed" }
//   502 { error: "payment_unavailable" }    (Stripe couldn't be reached)
export async function POST(req: NextRequest) {
  if (!(await isRegistrationOpen())) {
    return NextResponse.json({ error: "registration_closed" }, { status: 409 });
  }

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Honeypot: a field real people never see. Bots that fill every field
  // get a normal-looking reply so they don't learn anything.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ status: "already_registered" });
  }

  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  if (!(await verifyTurnstile(body.turnstileToken, ip))) {
    return NextResponse.json({ error: "spam_check_failed" }, { status: 403 });
  }

  // Prices come from the database (set in /admin), never from the browser.
  let tickets;
  try {
    tickets = await availableTickets();
  } catch (err) {
    console.error(`Could not load tickets: ${describeError(err)}`);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const result = validateRegistration(body, tickets.map((t) => t.id));
  if (!result.ok) {
    return NextResponse.json(
      { error: result.badId ? "invalid_request" : "validation", fields: result.errors },
      { status: 400 }
    );
  }
  const input = result.value;
  const ticket = tickets.find((t) => t.id === input.ticketId)!; // validated above

  let outcome;
  try {
    outcome = await createAttendee({
      id: input.id,
      full_name: input.fullName,
      email: input.email,
      role: input.role,
      organization: input.organization,
      phone: input.phone,
      language: input.language,
      source: "web",
      raw_payload: { form: "nsac-web", version: 1 },
      details: {
        first_name: input.firstName,
        last_name: input.lastName,
        job_title: input.jobTitle,
        nationality: input.nationality,
        residence_country: input.residenceCountry,
        organization_country: input.organizationCountry,
        professional_category: input.professionalCategory,
        job_function: input.jobFunction,
        needs_invitation_letter: input.needsInvitationLetter,
        food_allergies: input.foodAllergies,
        opt_in_organizer: input.optInOrganizer,
        opt_in_sponsors: input.optInSponsors,
        vat_number: input.vatNumber,
        invoice_reference: input.invoiceId,
        consent_at: new Date().toISOString(),
        ticket_type: ticket.id,
        amount_cents: ticket.amountCents,
        currency: ticket.currency,
        payment_status: "pending",
      },
    });
  } catch (err) {
    console.error(`Registration failed: ${describeError(err)}`);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const supabase = supabaseAdmin();
  let attendee: Attendee = outcome.attendee;
  // Only the browser that created this record (it knows the random id) may
  // upload a passport for it — never someone who merely typed the same email.
  let mayUploadPassport = outcome.status !== "duplicate_email";

  if (outcome.status === "duplicate_email") {
    if (attendee.payment_status !== "pending") {
      // Already has a ticket. Don't reveal anything on screen; re-send the
      // QR code to the address on file (rate-limited).
      if (canResendQr(attendee)) await sendAttendeeQr(attendee);
      return NextResponse.json({ status: "already_registered" });
    }
    // Registered before but never paid (e.g. closed the payment page):
    // let them pay now, for the ticket they just picked.
    const { data } = await supabase
      .from("attendees")
      .update({ ticket_type: ticket.id, amount_cents: ticket.amountCents, currency: ticket.currency })
      .eq("id", attendee.id)
      .eq("payment_status", "pending")
      .select()
      .maybeSingle();
    if (data) attendee = data as Attendee;
    mayUploadPassport = false;
  } else if (attendee.payment_status !== "pending") {
    // A retry of a submission that has since been paid.
    return NextResponse.json({ status: "already_registered" });
  }

  let passportUploadUrl: string | undefined;
  if (input.passport && mayUploadPassport) {
    const ext = PASSPORT_EXTENSIONS[input.passport.mime];
    const path = `${attendee.id}/passport.${ext}`;
    const { data, error } = await supabase.storage
      .from("passports")
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !data) {
      console.error("Could not create passport upload URL", error);
    } else {
      passportUploadUrl = data.signedUrl;
      await supabase.from("attendees").update({ passport_path: path }).eq("id", attendee.id);
    }
  }

  let checkoutUrl: string;
  try {
    checkoutUrl = await createCheckoutSession({
      attendee,
      ticket,
      language: input.language,
      baseUrl: baseUrl(req),
    });
  } catch (err) {
    console.error("Stripe Checkout Session failed", err);
    return NextResponse.json({ error: "payment_unavailable" }, { status: 502 });
  }

  return NextResponse.json({
    status: "payment_required",
    checkoutUrl,
    passportUploadUrl,
    passportSkipped: Boolean(input.passport && !mayUploadPassport),
  });
}
