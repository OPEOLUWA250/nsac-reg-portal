import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adminRoute } from "@/lib/server/admin-auth";

export const runtime = "nodejs";

// Manual override for edge cases (attendee lost their QR, staff verifies
// identity by hand, or an accidental scan needs undoing).
export const POST = adminRoute(async (req: NextRequest) => {
  const { id, checkedIn } = await req.json();
  if (!id || typeof id !== "string" || typeof checkedIn !== "boolean") {
    return NextResponse.json({ error: "missing id/checkedIn" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const update = checkedIn
    ? {
        checked_in: true,
        checked_in_at: new Date().toISOString(),
        checked_in_station: "Manual (Admin)",
      }
    : { checked_in: false, checked_in_at: null, checked_in_station: null };

  const { data: attendee, error } = await supabase
    .from("attendees")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error || !attendee) {
    console.error("Toggle check-in error", error);
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, attendee });
});
