import { NextRequest, NextResponse } from "next/server";
import { isStaffAuthorized } from "@/lib/staff-auth";
import { createAttendee, sendAttendeeQr } from "@/lib/attendee-service";

export const runtime = "nodejs";

// On-site walk-in registration, for attendees who show up without having
// registered online. Creates the attendee record and emails their QR code
// immediately, same as the public form does.
export async function POST(req: NextRequest) {
  if (!isStaffAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body.role === "string" && body.role.trim() ? body.role.trim() : "attendee";
  const organization =
    typeof body.organization === "string" && body.organization.trim()
      ? body.organization.trim()
      : null;
  const phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null;

  if (!fullName || !email) {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }

  let outcome;
  try {
    outcome = await createAttendee({
      full_name: fullName,
      email,
      role,
      organization,
      phone,
      source: "walk_in",
      // Walk-ins are registered by staff at the desk (payment, if any, is
      // handled there), so they get their QR code straight away.
      details: { payment_status: "not_required" },
    });
  } catch (error) {
    console.error("Walk-in registration error", error);
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }

  if (outcome.status !== "created") {
    return NextResponse.json(
      {
        error: `${outcome.attendee.full_name} is already registered with this email — use Resend instead.`,
      },
      { status: 409 }
    );
  }

  const emailSent = await sendAttendeeQr(outcome.attendee);
  // Attendee is created even if the email failed — admin can hit Resend.
  return NextResponse.json({ ok: true, attendee: outcome.attendee, emailSent });
}
