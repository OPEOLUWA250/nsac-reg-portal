import { NextResponse } from "next/server";
import { adminAuthClient } from "@/lib/server/admin-auth";

export const runtime = "nodejs";

// POST /api/auth/logout
export async function POST() {
  try {
    const client = await adminAuthClient();
    await client?.auth.signOut();
  } catch (err) {
    console.warn(`Sign-out failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return NextResponse.json({ ok: true });
}
