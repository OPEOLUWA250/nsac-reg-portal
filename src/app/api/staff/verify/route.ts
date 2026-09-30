import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/admin-auth";

export const runtime = "nodejs";

// Compatibility endpoint: only a complete admin session grants access.
export const POST = adminRoute(async () => {
  return NextResponse.json({ ok: true });
});
