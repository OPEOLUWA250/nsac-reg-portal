import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adminRoute } from "@/lib/server/admin-auth";
import { describeError } from "@/lib/describe-error";
import { sendVipNotice } from "@/lib/attendee-service";
import { ATTENDEE_ROLES, isAttendeeRole, type Attendee } from "@/lib/types";

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

// PATCH /api/admin/attendees  { id, role, notify }
// Changes someone's registration category, e.g. makes them a VIP (VIP
// isn't offered on the public form). Becoming a VIP emails them when
// `notify` is set and their ticket is valid; other changes send nothing.
// Their QR code doesn't change, and the badge shows the new category.
// Making someone a VIP, or taking it away, is for super admins only.
export const PATCH = adminRoute(async (req: NextRequest, _context, session) => {
  const isSuper = session.role === "super_admin";
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const role = typeof body?.role === "string" ? body.role.trim().toLowerCase() : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Missing registration id." }, { status: 400 });
  }
  if (!isAttendeeRole(role)) {
    return NextResponse.json({ error: `Unknown category. Use one of: ${ATTENDEE_ROLES.join(", ")}.` }, { status: 400 });
  }
  const superOnly = NextResponse.json({ error: "Only super admins can make someone a VIP or remove VIP." }, { status: 403 });
  if (role === "vip" && !isSuper) return superOnly;

  try {
    // Only the request that actually changes the role goes on to email, so
    // two admins clicking at once don't send two VIP emails. Other admins
    // can't change a VIP's category either.
    let query = supabaseAdmin().from("attendees").update({ role }).eq("id", id).neq("role", role);
    if (!isSuper) query = query.neq("role", "vip");
    const { data: updated, error } = await query.select().maybeSingle();
    if (error) throw error;

    if (!updated) {
      const { data: current, error: readError } = await supabaseAdmin().from("attendees").select("*").eq("id", id).maybeSingle();
      if (readError) throw readError;
      if (!current) return NextResponse.json({ error: "This registration no longer exists." }, { status: 404 });
      if (current.role === "vip" && role !== "vip" && !isSuper) return superOnly;
      return NextResponse.json({ attendee: current, changed: false, emailed: false });
    }

    const attendee = updated as Attendee;
    const emailed = role === "vip" && body?.notify === true ? await sendVipNotice(attendee) : false;
    return NextResponse.json({ attendee, changed: true, emailed });
  } catch (err) {
    console.error(`Change category failed for ${id}: ${describeError(err)}`);
    return NextResponse.json({ error: "Couldn't change the category. Try again." }, { status: 500 });
  }
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
