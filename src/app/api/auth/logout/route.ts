import { NextResponse } from "next/server";
import { adminAuthClient } from "@/lib/server/admin-auth";
import { ADMIN_ACTIVITY_COOKIE } from "@/lib/server/admin-idle";

export const runtime = "nodejs";

// POST /api/auth/logout
export async function POST() {
  try {
    const client = await adminAuthClient();
    await client?.auth.signOut();
  } catch (err) {
    console.warn(`Sign-out failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ADMIN_ACTIVITY_COOKIE);
  return response;
}
