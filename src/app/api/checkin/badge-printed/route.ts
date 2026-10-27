import { NextRequest, NextResponse } from "next/server";
import { codeFromQr } from "@/lib/qrcode";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adminRoute } from "@/lib/server/admin-auth";
import { logActivity } from "@/lib/server/activity-log";

export const runtime = "nodejs";

export const POST = adminRoute(async (req: NextRequest, _context, session) => {

  const { token } = await req.json();
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "missing token" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data: existing } = await supabase
    .from("attendees")
    .select("id, full_name, badge_print_count")
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

  const count = (existing.badge_print_count ?? 0) + 1;
  await logActivity(
    session,
    {
      area: "check_in",
      action: count > 1 ? "badge.reprinted" : "badge.printed",
      summary: count > 1 ? `reprinted ${existing.full_name}'s badge (print ${count})` : `printed ${existing.full_name}'s badge`,
      target: { type: "attendee", id: existing.id },
    },
    req
  );
  return NextResponse.json({ ok: true });
});
