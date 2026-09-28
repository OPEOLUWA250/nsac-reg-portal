import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, fulfillCheckoutSession } from "@/lib/payments";

export const runtime = "nodejs";

// Stripe → Developers → Webhooks → add endpoint:
//   https://YOUR-DOMAIN/api/stripe-webhook
// Events: checkout.session.completed, checkout.session.async_payment_succeeded
// Copy the endpoint's signing secret into STRIPE_WEBHOOK_SECRET.
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 400 });
  }

  // The signature is computed over the exact raw body, so read it as text.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    console.error("Stripe webhook signature check failed", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      await fulfillCheckoutSession(event.data.object as Stripe.Checkout.Session);
    }
  } catch (err) {
    // 500 makes Stripe retry later.
    console.error(`Failed to handle Stripe event ${event.id}`, err);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
