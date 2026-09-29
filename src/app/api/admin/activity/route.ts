import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAdminAreaAuthorized } from "@/lib/staff-auth";

export const runtime = "nodejs";

export interface ActivityItem {
  id: string;
  attendeeId: string;
  kind: "paid" | "pending" | "walk_in" | "checked_in";
  name: string;
  at: string;
}

// GET /api/admin/activity
// Recent events for the admin's notification bell: new registrations,
// payments, walk-ins and check-ins, newest first.
export async function GET(req: NextRequest) {
  if (!isAdminAreaAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin()
    .from("attendees")
    .select("id, full_name, source, payment_status, created_at, paid_at, checked_in, checked_in_at")
    .order("updated_at", { ascending: false })
    .limit(40);

  if (error) {
    console.error("Activity feed error", error);
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }

  const items: ActivityItem[] = [];
  for (const a of data ?? []) {
    if (a.checked_in && a.checked_in_at) {
      items.push({ id: `${a.id}:in`, attendeeId: a.id, kind: "checked_in", name: a.full_name, at: a.checked_in_at });
    }
    if (a.source === "walk_in") {
      items.push({ id: `${a.id}:walk`, attendeeId: a.id, kind: "walk_in", name: a.full_name, at: a.created_at });
    } else if (a.payment_status === "paid") {
      items.push({ id: `${a.id}:paid`, attendeeId: a.id, kind: "paid", name: a.full_name, at: a.paid_at ?? a.created_at });
    } else if (a.payment_status === "pending") {
      items.push({ id: `${a.id}:pending`, attendeeId: a.id, kind: "pending", name: a.full_name, at: a.created_at });
    }
  }
  items.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());

  return NextResponse.json({ items: items.slice(0, 20) });
}
