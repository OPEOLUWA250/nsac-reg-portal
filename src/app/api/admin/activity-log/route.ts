import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adminRoute } from "@/lib/server/admin-auth";
import { ownerEmails } from "@/lib/server/admin-emails";
import { logActivity } from "@/lib/server/activity-log";
import { describeError } from "@/lib/describe-error";
import { ACTIVITY_PAGE, isActivityArea, type ActivityEntry } from "@/lib/activity";

export const runtime = "nodejs";

// /api/admin/activity-log: the admin activity log (src/lib/activity.ts).
//   GET ?before=<id>&area=&actor=&q=   a page of entries, newest first.
//                                      Super admins only: it shows everyone's actions.
//   POST { kind: "export", what, count }  records something done in the
//                                      browser (a CSV download). Any admin.

const NOT_SET_UP = "The activity log isn't set up yet: run the admin_activity setup SQL in the Supabase SQL Editor.";

interface Row {
  id: number;
  at: string;
  actor_email: string | null;
  area: string;
  action: string;
  summary: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
}

const toEntry = (r: Row): ActivityEntry => ({
  id: r.id,
  at: r.at,
  actorEmail: r.actor_email,
  area: isActivityArea(r.area) ? r.area : "settings",
  action: r.action,
  summary: r.summary,
  targetType: r.target_type,
  targetId: r.target_id,
  details: r.details,
});

export const GET = adminRoute(
  async (req: NextRequest) => {
    const params = req.nextUrl.searchParams;
    const before = Number(params.get("before"));
    const area = params.get("area");
    const actor = params.get("actor")?.trim().toLowerCase();
    // Typed words only: characters that mean something to the filter are dropped.
    const q = (params.get("q") ?? "").replace(/[%_\\,()*]/g, " ").trim().slice(0, 100);

    const db = supabaseAdmin();
    let query = db
      .from("admin_activity")
      .select("id, at, actor_email, area, action, summary, target_type, target_id, details")
      .order("id", { ascending: false })
      .limit(ACTIVITY_PAGE + 1);
    if (Number.isInteger(before) && before > 0) query = query.lt("id", before);
    if (isActivityArea(area)) query = query.eq("area", area);
    if (actor) query = query.eq("actor_email", actor);
    if (q) query = query.ilike("summary", `%${q}%`);

    const [{ data, error }, admins] = await Promise.all([query, db.from("admin_users").select("email")]);
    if (error) {
      const missing = ["PGRST205", "42P01"].includes(error.code ?? "");
      if (!missing) console.error(`Activity log failed: ${describeError(error)}`);
      return NextResponse.json({ error: missing ? NOT_SET_UP : "Couldn't load the activity. Try again." }, { status: missing ? 503 : 500 });
    }
    const rows = (data ?? []) as Row[];
    // Everyone who can sign in, for the "Admin" filter.
    const people = [...new Set([...ownerEmails(), ...((admins.data ?? []) as { email: string }[]).map((a) => a.email.toLowerCase())])].sort();
    return NextResponse.json({
      entries: rows.slice(0, ACTIVITY_PAGE).map(toEntry),
      hasMore: rows.length > ACTIVITY_PAGE,
      admins: people,
    });
  },
  { superAdmin: true }
);

export const POST = adminRoute(async (req: NextRequest, _context, session) => {
  const body = await req.json().catch(() => ({}));
  const what = typeof body?.what === "string" ? body.what.trim().slice(0, 80) : "";
  const count = Number(body?.count);
  if (body?.kind !== "export" || !what || !Number.isInteger(count) || count < 0) {
    return NextResponse.json({ error: "Nothing to record." }, { status: 400 });
  }
  await logActivity(
    session,
    {
      area: "registrations",
      action: "registrations.exported",
      summary: `downloaded ${count} ${count === 1 ? "registration" : "registrations"} as a spreadsheet (${what})`,
      details: { what, count },
    },
    req
  );
  return NextResponse.json({ ok: true });
});
