import { NextRequest, NextResponse } from "next/server";
import { codeFromQr, generateQrSvgDataUrl, ticketQrContent } from "@/lib/qrcode";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adminRoute } from "@/lib/server/admin-auth";
import { scannerAttendee } from "@/lib/scanner-attendee";

export const runtime = "nodejs";

// Looks up an attendee by the token encoded in their QR code. Does NOT mark
// them checked in — that's a separate confirm step so the UI can show the
// attendee's details before staff commit to checking them in.
export const POST = adminRoute(async (req: NextRequest) => {

  const { token } = await req.json();
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "missing token" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: attendee, error } = await supabase
    .from("attendees")
    .select("*")
    .eq("unique_code", codeFromQr(token))
    .maybeSingle();

  if (error) {
    console.error("Lookup error", error);
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }

  if (!attendee) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // The printed badge carries the same /p/<code> QR as the ticket, so other
  // delegates can scan it. A missing base URL must not block check-in.
  let badgeQr: string | null = null;
  try {
    badgeQr = await generateQrSvgDataUrl(ticketQrContent(attendee.unique_code));
  } catch (err) {
    console.error("Badge QR generation error", err);
  }

  return NextResponse.json({ attendee: scannerAttendee(attendee), badgeQr }, { headers: { "Cache-Control": "private, no-store" } });
});
