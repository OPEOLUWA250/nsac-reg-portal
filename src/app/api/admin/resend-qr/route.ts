import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isStaffAuthorized } from "@/lib/staff-auth";
import { generateQrPngBuffer } from "@/lib/qrcode";
import { sendQrEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isStaffAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await req.json();
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: attendee, error } = await supabase
    .from("attendees")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !attendee) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const qrPngBuffer = await generateQrPngBuffer(attendee.unique_code);
    await sendQrEmail({
      toEmail: attendee.email,
      fullName: attendee.full_name,
      qrPngBuffer,
    });
  } catch (emailError) {
    console.error("Failed to resend QR email", emailError);
    return NextResponse.json({ error: "failed to send email" }, { status: 502 });
  }

  await supabase
    .from("attendees")
    .update({ qr_email_sent_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
