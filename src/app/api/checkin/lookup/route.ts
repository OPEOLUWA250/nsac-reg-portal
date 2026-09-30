import { NextRequest, NextResponse } from "next/server";
import { codeFromQr } from "@/lib/qrcode";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adminRoute } from "@/lib/server/admin-auth";

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

  return NextResponse.json({ attendee });
});
