import { NextRequest, NextResponse } from "next/server";
import { publicBaseUrl, toHttps } from "@/lib/public-url";
import { validateRegistration } from "@/lib/registration-fields";
import { verifyTurnstile } from "@/lib/turnstile";
import { createAttendee, sendAttendeeQr, canResendQr } from "@/lib/attendee-service";
import { isRegistrationOpen } from "@/lib/registration-config";
import { createCheckoutSession } from "@/lib/payments";
import { availableTickets } from "@/lib/ticket-store";
import { requiresVipPayment } from "@/lib/tickets";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Attendee } from "@/lib/types";
import { describeError } from "@/lib/describe-error";
import { checkPromoCode, discountedCents, type PromoCode } from "@/lib/promo-codes";
import { checkStudentCode } from "@/lib/student-codes";
import { clientIp, withinLimit } from "@/lib/server/rate-limit";

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
//   400 { error: "validation", fields }     (field -> error code, incl. promo codes)
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

  // Promo code (e.g. a sponsor's complimentary pass), checked with Stripe.
  let promo: PromoCode | null = null;
  if (input.promoCode) {
    try {
      const check = await checkPromoCode(input.promoCode, ticket.id);
      if (!check.ok) {
        return NextResponse.json({ error: "validation", fields: { promoCode: `promo_${check.problem}` } }, { status: 400 });
      }
      promo = check.promo;
    } catch (err) {
      console.error(`Promo code check failed: ${describeError(err)}`);
      return NextResponse.json({ error: "validation", fields: { promoCode: "promo_unavailable" } }, { status: 400 });
    }
  }
  // Student ticket: the personal code must belong to this email
  // (validateRegistration already requires one with that ticket).
  if (input.studentCode) {
    // Limits guessing; a real student needs a try or two at most.
    if (!(await withinLimit("student-code", clientIp(req), 20, 10 * 60))) {
      return NextResponse.json({ error: "validation", fields: { studentCode: "promo_rate_limited" } }, { status: 400 });
    }
    try {
      const check = await checkStudentCode(input.studentCode, input.email);
      if (!check.ok) {
        return NextResponse.json({ error: "validation", fields: { studentCode: `student_code_${check.problem}` } }, { status: 400 });
      }
    } catch (err) {
      console.error(`Student code check failed: ${describeError(err)}`);
      return NextResponse.json({ error: "validation", fields: { studentCode: "student_code_unavailable" } }, { status: 400 });
    }
  }
  const amountCents = promo ? discountedCents(ticket.amountCents, promo.percentOff) : ticket.amountCents;
  if (requiresVipPayment(input.role, amountCents)) {
    return NextResponse.json({ error: "validation", fields: { [promo ? "promoCode" : "ticket"]: "vip_payment_required" } }, { status: 400 });
  }

  // Everything the form collected (besides name, email, role, organisation,
  // phone and language, which createAttendee takes separately).
  const details = {
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
    share_details: input.shareDetails,
    // The student code is recorded here too, so admins can see which one was used.
    promo_code: promo?.code ?? input.studentCode ?? null,
    ticket_type: ticket.id,
    amount_cents: amountCents,
    currency: ticket.currency,
  };

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
      details: { ...details, payment_status: "pending" },
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
  let keepPreviousCheckout = false;

  if (outcome.status === "duplicate_email") {
    if (attendee.payment_status !== "pending") {
      // One registration per email: ask for another address (the form
      // normally catches this on step 1). The ticket is re-sent to the
      // address on file, in case it's the owner looking for it (rate-limited).
      if (canResendQr(attendee)) await sendAttendeeQr(attendee);
      return NextResponse.json({ error: "validation", fields: { email: "email_taken" } }, { status: 400 });
    }
    // Registered before but never paid (e.g. closed the payment page, or on
    // another device): let them pay now, for the ticket and code they just
    // picked. Whoever typed this email may not be the person on file, so
    // nothing on the record changes and their open payment page stays open;
    // the ticket and code are recorded only when this payment completes.
    keepPreviousCheckout = true;
    mayUploadPassport = false;
  } else if (attendee.payment_status !== "pending") {
    // A retry of a submission that has since been paid.
    return NextResponse.json({ status: "already_registered" });
  } else if (outcome.status === "retry") {
    // The same browser coming back (it knows this registration's private id)
    // with changed answers, e.g. a different ticket or a promo code after
    // closing the payment page: save them, so the record matches the payment.
    const { data } = await supabase
      .from("attendees")
      .update({
        ...details,
        full_name: input.fullName,
        role: input.role,
        organization: input.organization,
        phone: input.phone,
        language: input.language,
      })
      .eq("id", attendee.id)
      .eq("payment_status", "pending")
      .select()
      .maybeSingle();
    if (data) attendee = data as Attendee;
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
      promo,
      studentCode: input.studentCode,
      language: input.language,
      baseUrl: baseUrl(req),
      keepPrevious: keepPreviousCheckout,
    });
  } catch (err) {
    console.error("Stripe Checkout Session failed", err);
    // Stripe refuses a code that ran out (or was switched off) since the check.
    if (promo && /promotion code|coupon/i.test(describeError(err))) {
      return NextResponse.json({ error: "validation", fields: { promoCode: "promo_used_up" } }, { status: 400 });
    }
    return NextResponse.json({ error: "payment_unavailable" }, { status: 502 });
  }

  return NextResponse.json({
    status: "payment_required",
    checkoutUrl,
    passportUploadUrl,
    passportSkipped: Boolean(input.passport && !mayUploadPassport),
  });
}
