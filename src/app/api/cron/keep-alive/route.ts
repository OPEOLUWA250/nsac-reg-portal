import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// GET /api/cron/keep-alive
// Supabase's free plan pauses a project after 7 days without activity. Vercel
// calls this once a day (see vercel.json), and it runs one small real query
// against the database so the project always counts as active.
//
// Vercel sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set
// in the project's environment variables; then nobody else can trigger it.
// Without CRON_SECRET it still runs (so the database never pauses because
// the secret was forgotten), but it returns nothing beyond "ok".
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  if (!secret) console.warn("keep-alive: CRON_SECRET is not set; anyone can call this route");

  const headers = { "Cache-Control": "no-store" };
  try {
    const { error } = await supabaseAdmin().from("attendees").select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, at: new Date().toISOString() }, { headers });
  } catch (err) {
    // A failed run shows as an error in Vercel's Cron Jobs logs.
    console.error(`keep-alive: database query failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({ ok: false }, { status: 500, headers });
  }
}
