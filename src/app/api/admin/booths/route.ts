import { NextRequest, NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/admin-auth";
import { clearBoothAssignment, isNotSetUp, listBoothAssignments, refreshPublicMap, saveBoothAssignment } from "@/lib/server/booth-assignments";
import { boothCode, parseBoothAssignment } from "@/lib/venue/booth-fields";
import { describeError } from "@/lib/describe-error";
import { logActivity } from "@/lib/server/activity-log";

export const runtime = "nodejs";

// /admin/booths: which company has which booth on the venue map. List (GET),
// assign or edit (PUT), free a booth (DELETE). Any admin: selling booths is
// day-to-day work.

const NOT_SET_UP = "Booths aren't fully set up yet: run the booth assignments setup SQL in the Supabase SQL Editor.";

function failed(action: string, err: unknown) {
  console.error(`${action} failed: ${describeError(err)}`);
  if (isNotSetUp(err)) return NextResponse.json({ error: NOT_SET_UP }, { status: 503 });
  return NextResponse.json({ error: `Couldn't ${action.toLowerCase()}. Try again.` }, { status: 500 });
}

export const GET = adminRoute(async () => {
  try {
    return NextResponse.json({ assignments: await listBoothAssignments() });
  } catch (err) {
    return failed("Load the booths", err);
  }
});

// Body: { boothCode, status: "sold" | "reserved", companyName, sector?, website? }
export const PUT = adminRoute(async (req: NextRequest, _context, session) => {
  const body = await req.json().catch(() => ({}));
  const parsed = parseBoothAssignment(body && typeof body === "object" ? body : {});
  if ("fields" in parsed) return NextResponse.json({ error: "Check the highlighted fields.", fields: parsed.fields }, { status: 400 });
  try {
    const assignment = await saveBoothAssignment(parsed.value, session.email);
    console.info(`Booth ${assignment.boothCode} ${assignment.status} to "${assignment.companyName}" by ${session.email}`);
    refreshPublicMap();
    await logActivity(
      session,
      {
        area: "booths",
        action: assignment.status === "reserved" ? "booth.reserved" : "booth.sold",
        summary: `${assignment.status === "reserved" ? "reserved" : "assigned"} booth ${assignment.boothCode} ${assignment.status === "reserved" ? "for" : "to"} ${assignment.companyName}`,
        target: { type: "booth", id: assignment.boothCode },
        details: { sector: assignment.sector, website: assignment.website },
      },
      req
    );
    return NextResponse.json({ assignment });
  } catch (err) {
    return failed("Save the booth", err);
  }
});

// Body: { boothCode }
export const DELETE = adminRoute(async (req: NextRequest, _context, session) => {
  const body = await req.json().catch(() => ({}));
  const code = boothCode(body?.boothCode);
  if (!code) return NextResponse.json({ error: "No such booth." }, { status: 400 });
  try {
    const cleared = await clearBoothAssignment(code);
    if (cleared) {
      console.info(`Booth ${code} freed by ${session.email}`);
      refreshPublicMap();
      await logActivity(session, { area: "booths", action: "booth.freed", summary: `freed booth ${code}`, target: { type: "booth", id: code } }, req);
    }
    return NextResponse.json({ boothCode: code, cleared });
  } catch (err) {
    return failed("Free the booth", err);
  }
});
