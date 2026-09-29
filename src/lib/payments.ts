import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendAttendeeQr } from "@/lib/attendee-service";
import type { Attendee } from "@/lib/types";
import type { Ticket } from "@/lib/tickets";

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

interface CheckoutArgs {
  attendee: Pick<Attendee, "id" | "email" | "vat_number" | "invoice_reference" | "organization">;
  ticket: Ticket;
  language: "en" | "fr";
  baseUrl: string;
}

export async function createCheckoutSession({
  attendee,
  ticket,
  language,
  baseUrl,
}: CheckoutArgs): Promise<string> {
  // Up to 4 custom fields appear on the Stripe invoice (40-char names).
  const customFields: { name: string; value: string }[] = [];
  if (attendee.organization) customFields.push({ name: "Organisation", value: attendee.organization.slice(0, 140) });
  if (attendee.vat_number) customFields.push({ name: "Company VAT number", value: attendee.vat_number });
  if (attendee.invoice_reference) customFields.push({ name: "Reference", value: attendee.invoice_reference });

  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: ticket.currency,
          unit_amount: ticket.amountCents,
          product_data: { name: `${EVENT_TITLE} · ${ticket.name.en}` },
        },
      },
    ],
    customer_email: attendee.email,
    client_reference_id: attendee.id,
    metadata: { attendee_id: attendee.id, ticket_type: ticket.id },
    payment_intent_data: { metadata: { attendee_id: attendee.id, ticket_type: ticket.id } },
    // Discount codes created in the Stripe dashboard can be entered on the payment page.
    allow_promotion_codes: true,
    // Stripe emails a paid invoice (PDF) — useful for company reimbursement.
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: `${EVENT_TITLE} registration`,
        ...(customFields.length ? { custom_fields: customFields } : {}),
      },
    },
    locale: language,
    success_url: `${baseUrl}/register/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/?payment=cancelled`,
  });

  if (!session.url) throw new Error("Stripe did not return a Checkout URL");

  await supabaseAdmin()
    .from("attendees")
    .update({ stripe_session_id: session.id })
    .eq("id", attendee.id);

  return session.url;
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
  const attendeeId = session.client_reference_id ?? session.metadata?.attendee_id;
  if (!attendeeId) return null;

  const supabase = supabaseAdmin();

  if (!isSettled(session)) {
    const { data } = await supabase.from("attendees").select("*").eq("id", attendeeId).maybeSingle();
    return (data as Attendee | null) ?? null;
  }

  // Conditional update: only one caller wins the pending → paid transition.
  const { data: updated, error } = await supabase
    .from("attendees")
    .update({
      payment_status: "paid",
      paid_at: new Date().toISOString(),
      stripe_session_id: session.id,
      amount_cents: session.amount_total,
      currency: session.currency,
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
    await sendAttendeeQr(updated as Attendee);
    return updated as Attendee;
  }

  // Already paid earlier. If the confirmation email failed back then (e.g.
  // the email provider was down), try again now — but only once the first
  // attempt is well past, so the webhook and the success page arriving
  // together don't both send it.
  const { data: existing } = await supabase.from("attendees").select("*").eq("id", attendeeId).maybeSingle();
  const attendee = (existing as Attendee | null) ?? null;
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
