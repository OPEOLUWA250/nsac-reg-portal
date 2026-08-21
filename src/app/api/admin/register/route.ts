import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isStaffAuthorized } from "@/lib/staff-auth";
import { generateUniqueCode, generateQrPngBuffer } from "@/lib/qrcode";
import { sendQrEmail } from "@/lib/email";

export const runtime = "nodejs";

// On-site walk-in registration, for attendees who show up without having
// gone through Jotform. Creates the attendee record and emails their QR
// code immediately, same as the Jotform webhook path does.
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

  const supabase = supabaseAdmin();

  const { data: existing } = await supabase
    .from("attendees")
    .select("id, full_name")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: `${existing.full_name} is already registered with this email — use Resend instead.` },
      { status: 409 }
    );
  }

  const uniqueCode = generateUniqueCode();

  const { data: attendee, error } = await supabase
    .from("attendees")
    .insert({
      full_name: fullName,
      email,
      role,
      organization,
      phone,
      unique_code: uniqueCode,
    })
    .select()
    .single();

  if (error || !attendee) {
    console.error("Walk-in registration error", error);
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }

  try {
    const qrPngBuffer = await generateQrPngBuffer(attendee.unique_code);
    await sendQrEmail({
      toEmail: attendee.email,
      fullName: attendee.full_name,
      role: attendee.role,
      qrPngBuffer,
    });

    await supabase
      .from("attendees")
      .update({ qr_email_sent_at: new Date().toISOString() })
      .eq("id", attendee.id);
  } catch (emailError) {
    console.error("Failed to send QR email for walk-in", emailError);
    // Attendee is still created — admin can hit Resend once email is fixed.
  }

  return NextResponse.json({ ok: true, attendee });
}
