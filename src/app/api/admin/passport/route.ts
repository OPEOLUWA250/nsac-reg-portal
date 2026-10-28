import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adminRoute } from "@/lib/server/admin-auth";
import { getPassportFile, passportPicture } from "@/lib/server/passport-file";
import { describeError } from "@/lib/describe-error";
import { logActivity } from "@/lib/server/activity-log";

export const runtime = "nodejs";

// Passports are never public, and only super admins can open them.

// POST { id } -> { url }: a link to the passport as uploaded, expiring after
// 5 minutes, for preparing invitation letters.
export const POST = adminRoute(async (req: NextRequest, _context, session) => {
  const { id } = await req.json();
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: attendee } = await supabase
    .from("attendees")
    .select("passport_path, full_name")
    .eq("id", id)
    .maybeSingle();

  if (!attendee?.passport_path) {
    return NextResponse.json({ error: "no passport uploaded" }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from("passports")
    .createSignedUrl(attendee.passport_path, 300);

  if (error || !data) {
    return NextResponse.json({ error: "passport file not found" }, { status: 404 });
  }

  await logActivity(
    session,
    { area: "registrations", action: "passport.opened", summary: `opened ${attendee.full_name}'s passport file`, target: { type: "attendee", id } },
    req
  );
  return NextResponse.json({ url: data.signedUrl });
}, { superAdmin: true });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET ?id= -> the passport as a JPEG (page 1 of a PDF), for the preview in
// the attendee drawer. Kept only in this admin's browser, briefly.
export const GET = adminRoute(async (req: NextRequest, _context, session) => {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "missing id" }, { status: 400 });
  try {
    const file = await getPassportFile(id);
    if (!file) return NextResponse.json({ error: "no passport uploaded" }, { status: 404 });
    const picture = await passportPicture(file);
    if (!picture) return NextResponse.json({ error: "couldn't draw the passport" }, { status: 422 });
    const { data: who } = await supabaseAdmin().from("attendees").select("full_name").eq("id", id).maybeSingle();
    await logActivity(
      session,
      { area: "registrations", action: "passport.viewed", summary: `viewed ${who?.full_name ?? "someone"}'s passport`, target: { type: "attendee", id } },
      req
    );
    return new NextResponse(new Uint8Array(picture.content), {
      headers: {
        "Content-Type": picture.contentType,
        "Cache-Control": "private, max-age=600",
        "Content-Disposition": "inline",
      },
    });
  } catch (err) {
    console.error(`Passport preview failed for attendee ${id}: ${describeError(err)}`);
    return NextResponse.json({ error: "passport unavailable" }, { status: 502 });
  }
}, { superAdmin: true });
