import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isStaffAuthorized } from "@/lib/staff-auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isStaffAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const { data: attendees, error } = await supabase
    .from("attendees")
    .select("*")
    .order("full_name", { ascending: true });

  if (error) {
    console.error("List attendees error", error);
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }

  return NextResponse.json({ attendees });
}
