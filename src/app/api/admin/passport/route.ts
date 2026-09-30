import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adminRoute } from "@/lib/server/admin-auth";

export const runtime = "nodejs";

// Returns a link to an attendee's passport scan that expires after 5
// minutes, for preparing invitation letters. Passports are never public.
export const POST = adminRoute(async (req: NextRequest) => {
  const { id } = await req.json();
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: attendee } = await supabase
    .from("attendees")
    .select("passport_path")
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

  return NextResponse.json({ url: data.signedUrl });
});
