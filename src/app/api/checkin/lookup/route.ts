import { NextRequest, NextResponse } from "next/server";
import { badgeQrContent, codeFromQr, generateQrSvgDataUrl } from "@/lib/qrcode";
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

  const code = codeFromQr(token);
  const supabase = supabaseAdmin();
  const { data: attendee, error } = await supabase
    .from("attendees")
    .select("*")
    .eq("unique_code", code)
    .maybeSingle();

  if (error) {
    console.error("Lookup error", error);
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }

  if (!attendee) {
    // A badge's contact QR is not a ticket: say so, so staff ask for the
    // QR from the confirmation email instead. (Errors here: column not added
    // yet; treat as an unknown code.)
    const { data: badge } = await supabase.from("attendees").select("id").eq("contact_code", code).maybeSingle();
    return NextResponse.json({ error: badge ? "badge_qr" : "not found" }, { status: 404 });
  }

  // The printed badge carries the public contact code, never the entry code,
  // so a photo of a badge can't be used at check-in. No contact code yet
  // (migration not run) or no base URL: the badge prints without a QR.
  let badgeQr: string | null = null;
  if (attendee.contact_code) {
    try {
      badgeQr = await generateQrSvgDataUrl(badgeQrContent(attendee.contact_code));
    } catch (err) {
      console.error("Badge QR generation error", err);
    }
  } else {
    console.warn("Badge printed without a QR: run supabase/migrations/20261003100000_badge_contact_code.sql");
  }

  return NextResponse.json({ attendee: scannerAttendee(attendee), badgeQr }, { headers: { "Cache-Control": "private, no-store" } });
});
