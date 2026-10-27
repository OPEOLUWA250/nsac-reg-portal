import { NextResponse } from "next/server";
import { getBoothAssignments } from "@/lib/server/booth-assignments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/venue/booths: the booths as the public venue map shows them (the
// same list the page is drawn with: reserved booths without the company).
// Open maps fetch it again when an admin changes a booth (src/lib/venue/live.ts).
export async function GET() {
  return NextResponse.json({ exhibitors: await getBoothAssignments() }, { headers: { "Cache-Control": "no-store" } });
}
