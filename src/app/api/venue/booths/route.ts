import { NextResponse } from "next/server";
import { getBoothAssignments } from "@/lib/server/booth-assignments";

export const runtime = "nodejs";
// Served from the CDN like the page: every open map shares one copy, made
// again every 10 minutes and straight after an admin changes a booth.
// (Next needs this number written out; see BOOTHS_REFRESH_SECONDS.)
export const revalidate = 600;

// GET /api/venue/booths: the booths as the public venue map shows them (the
// same list the page is drawn with: reserved booths without the company).
// Open maps check it from time to time (src/lib/venue/live.ts).
export async function GET() {
  return NextResponse.json({ exhibitors: await getBoothAssignments() });
}
