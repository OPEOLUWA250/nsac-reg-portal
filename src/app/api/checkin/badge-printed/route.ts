import { NextRequest, NextResponse } from "next/server";
import { codeFromQr } from "@/lib/qrcode";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isStaffAuthorized } from "@/lib/staff-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isStaffAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { token } = await req.json();
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "missing token" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data: existing } = await supabase
    .from("attendees")
    .select("id, badge_print_count")
    .eq("unique_code", codeFromQr(token))
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("attendees")
    .update({
      badge_printed_at: new Date().toISOString(),
      badge_print_count: (existing.badge_print_count ?? 0) + 1,
    })
    .eq("id", existing.id);

  if (error) {
    console.error("Badge-printed update error", error);
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
