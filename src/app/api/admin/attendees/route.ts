import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adminRoute } from "@/lib/server/admin-auth";
import { describeError } from "@/lib/describe-error";

export const runtime = "nodejs";

export const GET = adminRoute(async (req: NextRequest) => {
  const supabase = supabaseAdmin();
  const { data: attendees, error } = await supabase
    .from("attendees")
    .select("*")
    .order("full_name", { ascending: true });

  if (error) {
    console.error("List attendees error", error);
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }

  return NextResponse.json({ attendees });
});

// DELETE /api/admin/attendees?id=<uuid>          one registration
// DELETE /api/admin/attendees?all=1&confirm=DELETE every registration
// Super admins only. Also deletes their passport files. Stripe payments are
// not refunded (do that in the Stripe dashboard). This can't be undone.
export const DELETE = adminRoute(async (req: NextRequest) => {
  const id = req.nextUrl.searchParams.get("id");
  const all = req.nextUrl.searchParams.get("all") === "1";
  if (all && req.nextUrl.searchParams.get("confirm") !== "DELETE") {
    return NextResponse.json({ error: "Type DELETE to confirm deleting every registration." }, { status: 400 });
  }
  if (!all && !(id && /^[0-9a-f-]{36}$/i.test(id))) {
    return NextResponse.json({ error: "Missing registration id." }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  try {
    let query = supabase.from("attendees").select("id, passport_path");
    if (!all) query = query.eq("id", id!);
    const { data: rows, error } = await query;
    if (error) throw error;

    const passports = (rows ?? []).map((r) => r.passport_path).filter((p): p is string => Boolean(p));
    if (passports.length) {
      const { error: storageError } = await supabase.storage.from("passports").remove(passports);
      if (storageError) console.error(`Couldn't delete passport files: ${storageError.message}`);
    }

    const ids = (rows ?? []).map((r) => r.id);
    if (ids.length) {
      const { error: deleteError } = await supabase.from("attendees").delete().in("id", ids);
      if (deleteError) throw deleteError;
    }
    return NextResponse.json({ deleted: ids.length });
  } catch (err) {
    console.error(`Delete registrations failed: ${describeError(err)}`);
    return NextResponse.json({ error: "Couldn't delete. Try again." }, { status: 500 });
  }
}, { superAdmin: true });
