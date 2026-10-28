import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { describeError } from "@/lib/describe-error";
import { createCheckoutSession } from "@/lib/payments";
import { clientIp, withinLimit } from "@/lib/server/rate-limit";
import { attendeeIdFromToken, linkBaseUrl, paymentOffer } from "@/lib/server/payment-link";
import type { Attendee } from "@/lib/types";

export const runtime = "nodejs";

// POST /api/pay { token, ticketId? }: from /pay/<token>, the page a payment
// reminder opens. Makes a fresh Stripe payment page at today's price (any
// older open one is closed, so they can't pay twice) and returns its address.
//   200 { status: "checkout", checkoutUrl }
//   200 { status: "paid" | "closed" | "choose" }   nothing to pay, or pick a ticket
//   404 { status: "invalid" }                     not a link we sent
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const ticketId = typeof body?.ticketId === "string" ? body.ticketId : null;
  const id = attendeeIdFromToken(token);
  if (!id) return NextResponse.json({ status: "invalid" }, { status: 404 });
  if (!(await withinLimit("pay-link", clientIp(req), 30, 10 * 60))) {
    return NextResponse.json({ status: "error", error: "too_many" }, { status: 429 });
  }

  try {
    const { data, error } = await supabaseAdmin().from("attendees").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ status: "invalid" }, { status: 404 });
    const attendee = data as Attendee;
    const offer = await paymentOffer(attendee, { ticketId });
    if (offer.kind !== "pay") return NextResponse.json({ status: offer.kind });

    const baseUrl = linkBaseUrl(req.nextUrl.origin);
    const checkoutUrl = await createCheckoutSession({
      attendee,
      ticket: offer.ticket,
      promo: offer.promo,
      studentCode: offer.studentCode,
      language: attendee.language === "fr" ? "fr" : "en",
      baseUrl,
      cancelUrl: `${baseUrl}/pay/${token}`,
    });
    return NextResponse.json({ status: "checkout", checkoutUrl });
  } catch (err) {
    console.error(`Payment link ${id} failed: ${describeError(err)}`);
    return NextResponse.json({ status: "error" }, { status: 502 });
  }
}
