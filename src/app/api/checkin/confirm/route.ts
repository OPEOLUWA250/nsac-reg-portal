import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isStaffAuthorized } from "@/lib/staff-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isStaffAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { token, station } = await req.json();
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "missing token" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data: existing } = await supabase
    .from("attendees")
    .select("id, checked_in, payment_status")
    .eq("unique_code", token.trim())
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (existing.payment_status === "pending") {
    return NextResponse.json(
      { error: "Payment not completed for this registration — send them to the help desk." },
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

  return NextResponse.json({ ok: true, attendee, alreadyCheckedIn: false });
}
