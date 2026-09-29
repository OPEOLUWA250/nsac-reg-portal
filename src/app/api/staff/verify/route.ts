import { NextRequest, NextResponse } from "next/server";
import { isStaffAuthorized } from "@/lib/staff-auth";

export const runtime = "nodejs";

// POST /api/staff/verify (x-staff-code header). Lets the sign-in screen tell
// staff straight away whether the code they typed is right.
export async function POST(req: NextRequest) {
  if (!isStaffAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
