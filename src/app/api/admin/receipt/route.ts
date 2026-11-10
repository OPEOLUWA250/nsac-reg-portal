import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adminRoute } from "@/lib/server/admin-auth";
import { logActivity } from "@/lib/server/activity-log";
import { buildReceipt, sendAttendeeReceipt } from "@/lib/attendee-service";
import { describeError } from "@/lib/describe-error";
import { hasReceipt, type Attendee } from "@/lib/types";

export const runtime = "nodejs";

// A registrant's payment receipt (PDF), from their details in the dashboard.
//   GET  ?id=…  downloads it
//   POST {id}   emails it to them again ("Resend receipt")

const NO_PAYMENT = "No receipt: there was no payment for this registration (free pass, walk-in or awaiting payment).";

async function load(id: unknown): Promise<Attendee | null> {
  if (typeof id !== "string" || !id) return null;
  const { data } = await supabaseAdmin().from("attendees").select("*").eq("id", id).maybeSingle();
  return (data as Attendee | null) ?? null;
}

export const GET = adminRoute(async (req: NextRequest) => {
  const attendee = await load(req.nextUrl.searchParams.get("id"));
  if (!attendee) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!hasReceipt(attendee)) return NextResponse.json({ error: NO_PAYMENT }, { status: 409 });
  try {
    const receipt = await buildReceipt(attendee);
    if (!receipt) return NextResponse.json({ error: NO_PAYMENT }, { status: 409 });
    return new NextResponse(new Uint8Array(receipt.pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${receipt.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error(`Could not make the receipt for attendee ${attendee.id}: ${describeError(err)}`);
    return NextResponse.json({ error: "Couldn't make the receipt. Try again." }, { status: 500 });
  }
});

export const POST = adminRoute(async (req: NextRequest, _context, session) => {
  const { id } = await req.json().catch(() => ({}));
  const attendee = await load(id);
  if (!attendee) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!hasReceipt(attendee)) return NextResponse.json({ error: NO_PAYMENT }, { status: 409 });

  if (!(await sendAttendeeReceipt(attendee))) {
    return NextResponse.json({ error: "Couldn't send the receipt email. Try again." }, { status: 502 });
  }
  await logActivity(
    session,
    { area: "registrations", action: "attendee.receipt_sent", summary: `sent ${attendee.full_name}'s payment receipt`, target: { type: "attendee", id: attendee.id } },
    req
  );
  return NextResponse.json({ ok: true });
});
