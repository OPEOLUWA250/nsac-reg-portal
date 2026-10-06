import { NextRequest, NextResponse } from "next/server";
import { checkoutAttendeeId, retrieveCheckoutSession } from "@/lib/payments";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { renderTicket, ticketFilename } from "@/lib/ticket-image";
import { hasValidTicket, type Attendee } from "@/lib/types";
import { describeError } from "@/lib/describe-error";

export const runtime = "nodejs";

// GET /api/ticket?session_id=cs_...[&download=1]
// The branded ticket PNG shown on /register/success. The Stripe Checkout
// session id (only known to whoever completed that payment) is the key, and
// the ticket is only served once the registration is paid.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id") ?? "";
  const session = await retrieveCheckoutSession(sessionId);
  const attendeeId = checkoutAttendeeId(session);
  if (!attendeeId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data } = await supabaseAdmin().from("attendees").select("*").eq("id", attendeeId).maybeSingle();
  const attendee = data as Attendee | null;
  if (!attendee || !hasValidTicket(attendee)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
    if (req.nextUrl.searchParams.get("download") === "1") {
      headers["Content-Disposition"] = `attachment; filename="${ticketFilename()}"`;
    }
    return await renderTicket(attendee, { headers });
  } catch (err) {
    console.error(`Could not render ticket for ${attendee.id}: ${describeError(err)}`);
    return NextResponse.json({ error: "could not render ticket" }, { status: 500 });
  }
}
