import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAdminAreaAuthorized } from "@/lib/staff-auth";
import { sendAttendeeQr } from "@/lib/attendee-service";
import type { Attendee } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isAdminAreaAuthorized(req)) {
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

  // sendAttendeeQr also records qr_email_sent_at on success.
  const sent = await sendAttendeeQr(attendee as Attendee);
  if (!sent) {
    return NextResponse.json({ error: "failed to send email" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
