import { NextRequest, NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/admin-auth";
import { createAttendee, sendAttendeeQr } from "@/lib/attendee-service";
import { ATTENDEE_ROLES, isAttendeeRole } from "@/lib/types";
import { describeError } from "@/lib/describe-error";

export const runtime = "nodejs";

// On-site walk-in registration, for attendees who show up without having
// registered online. Creates the attendee record and emails their QR code
// immediately, same as the public form does.
export const POST = adminRoute(async (req: NextRequest) => {
  const body = await req.json();
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const requested = typeof body.role === "string" ? body.role.trim().toLowerCase() : "";
  const role = isAttendeeRole(requested) ? requested : "delegate";
  const organization =
    typeof body.organization === "string" && body.organization.trim()
      ? body.organization.trim()
      : null;
  const phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null;

  if (!fullName || !email) {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }
  if (!isAttendeeRole(role)) {
    return NextResponse.json(
      { error: `Unknown role "${role}". Use one of: ${ATTENDEE_ROLES.join(", ")}.` },
      { status: 400 }
    );
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
    console.error(`Walk-in registration error: ${describeError(error)}`);
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }

  if (outcome.status !== "created") {
    return NextResponse.json(
      {
        error: `${outcome.attendee.full_name} is already registered with this email. Use "Resend QR email" in their details instead.`,
      },
      { status: 409 }
    );
  }

  const emailSent = await sendAttendeeQr(outcome.attendee);
  // Attendee is created even if the email failed — admin can hit Resend.
  return NextResponse.json({ ok: true, attendee: outcome.attendee, emailSent });
});
