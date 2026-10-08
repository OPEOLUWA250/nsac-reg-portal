import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendAttendeeQr } from "@/lib/attendee-service";
import type { Attendee } from "@/lib/types";
import type { Ticket } from "@/lib/tickets";
import type { PromoCode } from "@/lib/promo-codes";
import { markStudentCodeUsed } from "@/lib/student-codes";

// Stripe Checkout: we create a Checkout Session and send the registrant to
// Stripe's hosted payment page. Card details never touch our server. When
// Stripe reports the payment as complete (webhook, or the success page —
// whichever comes first) we mark the attendee paid and email their QR code.

let stripeClient: Stripe | null = null;

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY environment variable");
  stripeClient ??= new Stripe(key, localApiOverride());
  return stripeClient;
}

// Local testing only: STRIPE_API_BASE=http://localhost:12111 points the SDK
// at stripe-mock (github.com/stripe/stripe-mock). Never set it in production.
function localApiOverride(): ConstructorParameters<typeof Stripe>[1] {
  const base = process.env.STRIPE_API_BASE;
  if (!base) return undefined;
  const url = new URL(base);
  const protocol = url.protocol === "http:" ? "http" : "https";
  return {
    host: url.hostname,
    port: Number(url.port) || (protocol === "http" ? 80 : 443),
    protocol,
  };
}

export const EVENT_TITLE = "NewSpace Africa Conference 2027";

// Every ticket is sold as this one Stripe product. The Stripe account also
// sells for the Space in Africa website, and promo codes are limited to this
// product (promo-codes.ts), so a conference code can't discount anything
// sold there. Created on first use; the ticket's own name goes on the
// payment page and invoice instead.
export const TICKET_PRODUCT_ID = "nsac_reg_portal_ticket";
let ticketProductReady: Promise<string> | null = null;

export function ticketProduct(): Promise<string> {
  ticketProductReady ??= ensureTicketProduct().catch((err) => {
    ticketProductReady = null; // try again next time
    throw err;
  });
  return ticketProductReady;
}

async function ensureTicketProduct(): Promise<string> {
  try {
    const product = await stripe().products.retrieve(TICKET_PRODUCT_ID);
    // Archived in the Stripe dashboard: checkouts would fail.
    if (!product.active) await stripe().products.update(TICKET_PRODUCT_ID, { active: true });
  } catch (err) {
    if ((err as { code?: string }).code !== "resource_missing") throw err;
    try {
      await stripe().products.create({
        id: TICKET_PRODUCT_ID,
        name: `${EVENT_TITLE} ticket`,
        metadata: { app: "nsac-reg-portal" },
      });
    } catch (createErr) {
      // Another request created it at the same moment.
      if ((createErr as { code?: string }).code !== "resource_already_exists") throw createErr;
    }
  }
  return TICKET_PRODUCT_ID;
}

interface CheckoutArgs {
  attendee: Pick<Attendee, "id" | "email" | "vat_number" | "invoice_reference" | "organization"> & {
    stripe_session_id?: string | null;
  };
  ticket: Ticket;
  /** Promo code entered on the form, already checked. */
  promo?: PromoCode | null;
  /** Student code entered on the form, already checked; used up when the payment succeeds. */
  studentCode?: string | null;
  language: "en" | "fr";
  baseUrl: string;
  /**
   * Someone who may not be the registrant (they only typed the same email):
   * leave the registrant's open payment page alone and don't touch the
   * record. If both pages get paid, the second payment is refunded.
   */
  keepPrevious?: boolean;
}

export async function createCheckoutSession({
  attendee,
  ticket,
  promo,
  studentCode = null,
  language,
  baseUrl,
  keepPrevious = false,
}: CheckoutArgs): Promise<string> {
  // Up to 4 custom fields appear on the Stripe invoice (40-char names).
  const customFields: { name: string; value: string }[] = [{ name: "Ticket", value: ticket.name.en.slice(0, 140) }];
  if (attendee.organization) customFields.push({ name: "Organisation", value: attendee.organization.slice(0, 140) });
  if (attendee.vat_number) customFields.push({ name: "Company VAT number", value: attendee.vat_number });
  if (attendee.invoice_reference) customFields.push({ name: "Reference", value: attendee.invoice_reference });

  // Someone starting again (another tab, or back after closing the payment
  // page) gets a new payment page: close the old one, so the same
  // registration can never be paid twice.
  if (attendee.stripe_session_id && !keepPrevious) {
    try {
      const previous = await stripe().checkout.sessions.retrieve(attendee.stripe_session_id);
      if (previous.status === "open") await stripe().checkout.sessions.expire(previous.id);
    } catch (err) {
      console.warn(`Couldn't close the previous payment page ${attendee.stripe_session_id}`, err);
    }
  }

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: ticket.currency,
          unit_amount: ticket.amountCents,
          product: await ticketProduct(),
        },
      },
    ],
    // The product is the same for every ticket: say which one this is.
    custom_text: { submit: { message: `${ticket.name[language] || ticket.name.en}` } },
    customer_email: attendee.email,
    client_reference_id: attendee.id,
    metadata: {
      attendee_id: attendee.id,
      ticket_type: ticket.id,
      promo_code: promo?.code ?? studentCode ?? "",
      ...(studentCode ? { student_code: studentCode } : {}),
    },
    payment_intent_data: { metadata: { attendee_id: attendee.id, ticket_type: ticket.id } },
    // Promo codes are entered on our form (so the price shown there is the
    // price charged) and applied here. With a 100% code Stripe asks for no
    // card and the session completes as "no_payment_required".
    ...(promo ? { discounts: [{ promotion_code: promo.id }] } : {}),
    // Stripe emails a paid invoice (PDF) — useful for company reimbursement.
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: `${EVENT_TITLE} registration · ${ticket.name.en}`,
        ...(customFields.length ? { custom_fields: customFields } : {}),
      },
    },
    locale: language,
    // Charge in the ticket's currency only. Adaptive Pricing is on for the
    // shared Stripe account (the Space in Africa website uses it), so turn
    // it off here rather than in the dashboard.
    adaptive_pricing: { enabled: false },
    success_url: `${baseUrl}/register/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/?payment=cancelled`,
  };

  // A wide Space in Africa logo, so it shows large at the top of the payment
  // page. Set per payment page rather than in the Stripe dashboard, which the
  // Space in Africa website shares. Stripe fetches it, so only from a public
  // https address (not localhost).
  const branded: Stripe.Checkout.SessionCreateParams = baseUrl.startsWith("https://")
    ? { ...params, branding_settings: { logo: { type: "url", url: `${baseUrl}/brand/space-in-africa-checkout.png` } } }
    : params;
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe().checkout.sessions.create(branded);
  } catch (err) {
    // A logo problem must never stop a payment: try again without it.
    if (branded === params || !String((err as { param?: string }).param ?? "").startsWith("branding_settings")) throw err;
    console.warn(`Checkout logo refused, continuing without it: ${(err as Error).message}`);
    session = await stripe().checkout.sessions.create(params);
  }

  if (!session.url) throw new Error("Stripe did not return a Checkout URL");

  if (!keepPrevious) {
    await supabaseAdmin()
      .from("attendees")
      .update({ stripe_session_id: session.id })
      .eq("id", attendee.id);
  }

  return session.url;
}

/**
 * The attendee a Checkout Session paid for, or null when it isn't one of
 * ours. The Stripe account also takes payments for the Space in Africa
 * website, whose sessions reach our webhook too: only sessions this portal
 * created carry the attendee in both places (createCheckoutSession).
 */
export function checkoutAttendeeId(session: Stripe.Checkout.Session | null | undefined): string | null {
  const id = session?.metadata?.attendee_id;
  return id && session.client_reference_id === id ? id : null;
}

function isSettled(session: Stripe.Checkout.Session): boolean {
  // "no_payment_required" = a 100% discount code was used.
  return session.payment_status === "paid" || session.payment_status === "no_payment_required";
}

/**
 * Marks the attendee behind a completed Checkout Session as paid and emails
 * their QR code. Safe to call many times (webhook retries, success page
 * reloads): only the call that flips 'pending' → 'paid' sends the email.
 * Returns the attendee, or null if the session isn't paid or isn't ours.
 */
export async function fulfillCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<Attendee | null> {
  const attendeeId = checkoutAttendeeId(session);
  if (!attendeeId) return null;

  const supabase = supabaseAdmin();

  if (!isSettled(session)) {
    const { data } = await supabase.from("attendees").select("*").eq("id", attendeeId).maybeSingle();
    return (data as Attendee | null) ?? null;
  }

  // Conditional update: only one caller wins the pending → paid transition.
  // The ticket and code come from the session that was paid, so the record
  // always matches the payment (see keepPrevious in createCheckoutSession).
  const { data: updated, error } = await supabase
    .from("attendees")
    .update({
      payment_status: "paid",
      paid_at: new Date().toISOString(),
      stripe_session_id: session.id,
      amount_cents: session.amount_total,
      currency: session.currency,
      ...(session.metadata?.ticket_type ? { ticket_type: session.metadata.ticket_type, promo_code: session.metadata.promo_code || null } : {}),
    })
    .eq("id", attendeeId)
    .eq("payment_status", "pending")
    .select()
    .maybeSingle();

  if (error) {
    console.error(`Failed to mark attendee ${attendeeId} as paid`, error);
    throw error;
  }

  if (updated) {
    if (session.metadata?.student_code) await markStudentCodeUsed(session.metadata.student_code, attendeeId);
    await sendAttendeeQr(updated as Attendee);
    return updated as Attendee;
  }

  // Already paid earlier. If the confirmation email failed back then (e.g.
  // the email provider was down), try again now — but only once the first
  // attempt is well past, so the webhook and the success page arriving
  // together don't both send it.
  const { data: existing } = await supabase.from("attendees").select("*").eq("id", attendeeId).maybeSingle();
  const attendee = (existing as Attendee | null) ?? null;
  if (attendee?.stripe_session_id && attendee.stripe_session_id !== session.id) {
    await refundDuplicatePayment(session, attendeeId);
  }
  if (
    attendee &&
    !attendee.qr_email_sent_at &&
    attendee.paid_at &&
    Date.now() - new Date(attendee.paid_at).getTime() > EMAIL_RETRY_AFTER_MS &&
    Date.now() - (lastEmailRetry.get(attendee.id) ?? 0) > EMAIL_RETRY_INTERVAL_MS
  ) {
    lastEmailRetry.set(attendee.id, Date.now());
    if (await sendAttendeeQr(attendee)) {
      return { ...attendee, qr_email_sent_at: new Date().toISOString() };
    }
  }
  return attendee;
}

/**
 * A second payment page for a registration that was already paid through
 * another one (e.g. the registrant on two devices) was paid too: give the
 * money back. Same refund key every time, so webhook retries and success
 * page reloads refund once.
 */
async function refundDuplicatePayment(session: Stripe.Checkout.Session, attendeeId: string): Promise<void> {
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (session.payment_status !== "paid" || !session.amount_total || !paymentIntent) return;
  try {
    await stripe().refunds.create(
      { payment_intent: paymentIntent, reason: "duplicate", metadata: { attendee_id: attendeeId, checkout_session: session.id } },
      { idempotencyKey: `duplicate-registration-${session.id}` }
    );
    console.warn(`Refunded duplicate payment ${session.id} for attendee ${attendeeId}`);
  } catch (err) {
    console.error(`Couldn't refund duplicate payment ${session.id} for attendee ${attendeeId}: refund it in Stripe`, err);
  }
}

const EMAIL_RETRY_AFTER_MS = 60_000;
// While email is failing, page reloads shouldn't hammer the email provider.
const EMAIL_RETRY_INTERVAL_MS = 5 * 60_000;
const lastEmailRetry = new Map<string, number>();

export async function retrieveCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session | null> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return null;
  try {
    return await stripe().checkout.sessions.retrieve(sessionId);
  } catch (err) {
    console.error("Could not retrieve Checkout Session", err);
    return null;
  }
}
