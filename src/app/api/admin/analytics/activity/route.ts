import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adminRoute } from "@/lib/server/admin-auth";
import { describeError } from "@/lib/describe-error";
import { isActivityArea, type ActivityArea } from "@/lib/activity";

export const runtime = "nodejs";

// /api/admin/analytics/activity: what admins have done lately, for the
// Analytics page. Read only, from the admin_activity table (src/lib/activity.ts).
//   GET   { since, events: [{ at, actor, area }], truncated, recent: [...] }
//         events cover the last 90 days, newest first; recent holds the
//         latest entries with their sentence. Super admins only: it shows
//         everyone's actions.

const ACTIVITY_DAYS = 90;
const MAX_EVENTS = 10_000;
const RECENT = 8;

const NOT_SET_UP = "The activity log isn't set up yet: run the admin_activity setup SQL in the Supabase SQL Editor.";

const area = (v: string): ActivityArea => (isActivityArea(v) ? v : "settings");

export const GET = adminRoute(
  async () => {
    const since = new Date(Date.now() - ACTIVITY_DAYS * 24 * 3600_000).toISOString();
    const db = supabaseAdmin();
    const [events, recent] = await Promise.all([
      db.from("admin_activity").select("at, actor_email, area").gte("at", since).order("id", { ascending: false }).limit(MAX_EVENTS + 1),
      db.from("admin_activity").select("id, at, actor_email, area, summary").order("id", { ascending: false }).limit(RECENT),
    ]);
    const error = events.error ?? recent.error;
    if (error) {
      const missing = ["PGRST205", "42P01"].includes(error.code ?? "");
      if (!missing) console.error(`Activity analytics failed: ${describeError(error)}`);
      return NextResponse.json({ error: missing ? NOT_SET_UP : "Couldn't load the admin activity. Try again." }, { status: missing ? 503 : 500 });
    }
    const rows = (events.data ?? []) as { at: string; actor_email: string | null; area: string }[];
    const latest = (recent.data ?? []) as { id: number; at: string; actor_email: string | null; area: string; summary: string }[];
    return NextResponse.json({
      since,
      events: rows.slice(0, MAX_EVENTS).map((r) => ({ at: r.at, actor: r.actor_email, area: area(r.area) })),
      truncated: rows.length > MAX_EVENTS,
      recent: latest.map((r) => ({ id: r.id, at: r.at, actorEmail: r.actor_email, area: area(r.area), summary: r.summary })),
    });
  },
  { superAdmin: true }
);
