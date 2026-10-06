import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/admin-auth";

export const runtime = "nodejs";

// POST /api/auth/activity
// The admin is using the page: AdminContext calls this at most every few
// minutes while they click, type or scroll. adminRoute renews the inactivity
// clock on every request but GET (src/lib/server/admin-idle.ts).
export const POST = adminRoute(async () => NextResponse.json({ ok: true }));
