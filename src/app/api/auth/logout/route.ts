import { NextRequest, NextResponse } from "next/server";
import { adminAuthClient, getAdminSession } from "@/lib/server/admin-auth";
import { ADMIN_ACTIVITY_COOKIE } from "@/lib/server/admin-idle";
import { logActivity } from "@/lib/server/activity-log";

export const runtime = "nodejs";

// POST /api/auth/logout
export async function POST(req: NextRequest) {
  try {
    // Who it was, before the session ends (nobody, if it had already timed out).
    const session = await getAdminSession();
    if (session) await logActivity(session, { area: "sign_in", action: "sign_out", summary: "signed out" }, req);
    const client = await adminAuthClient();
    await client?.auth.signOut();
  } catch (err) {
    console.warn(`Sign-out failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ADMIN_ACTIVITY_COOKIE);
  return response;
}
