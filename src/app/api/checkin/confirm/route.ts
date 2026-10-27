import { NextRequest, NextResponse } from "next/server";
import { codeFromQr } from "@/lib/qrcode";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adminRoute } from "@/lib/server/admin-auth";
import { scannerAttendee } from "@/lib/scanner-attendee";
import { logActivity } from "@/lib/server/activity-log";

export const runtime = "nodejs";

export const POST = adminRoute(async (req: NextRequest, _context, session) => {

  const { token, station } = await req.json();
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "missing token" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data: existing } = await supabase
    .from("attendees")
    .select("id, checked_in, payment_status")
    .eq("unique_code", codeFromQr(token))
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (existing.payment_status === "pending") {
    return NextResponse.json(
      { error: "Payment not completed for this registration. Send them to the help desk." },
      { status: 409 }
    );
  }

  if (existing.checked_in) {
    return NextResponse.json({ ok: true, alreadyCheckedIn: true });
  }

  // Conditional on checked_in = false so two stations scanning the same
  // person at the same moment record a single check-in.
  const { data: attendee, error } = await supabase
    .from("attendees")
    .update({
      checked_in: true,
      checked_in_at: new Date().toISOString(),
      checked_in_station: station ?? null,
    })
    .eq("id", existing.id)
    .eq("checked_in", false)
    .select()
    .maybeSingle();

  if (!error && !attendee) {
    return NextResponse.json({ ok: true, alreadyCheckedIn: true });
  }

  if (error || !attendee) {
    console.error("Confirm check-in error", error);
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }

  await logActivity(
    session,
    {
      area: "check_in",
      action: "checkin.scanned",
      summary: `checked in ${attendee.full_name}${typeof station === "string" && station ? ` at ${station.slice(0, 60)}` : ""}`,
      target: { type: "attendee", id: attendee.id },
    },
    req
  );
  return NextResponse.json({ ok: true, attendee: scannerAttendee(attendee), alreadyCheckedIn: false }, { headers: { "Cache-Control": "private, no-store" } });
});
