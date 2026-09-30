import { NextRequest, NextResponse } from "next/server";
import { isAdminAreaAuthorized, isAdminAuthorized } from "@/lib/staff-auth";
import { createPromoCode, listPromoCodes, setPromoCodeActive } from "@/lib/promo-codes";
import { PROMO_CODE_RE } from "@/lib/registration-fields";
import { describeError } from "@/lib/describe-error";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// /admin/promo-codes: list (GET), create (POST), switch on/off (PATCH).

export async function GET(req: NextRequest) {
  if (!isAdminAreaAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const [codes, counts] = await Promise.all([listPromoCodes(), registrationsPerCode()]);
    return NextResponse.json({
      codes: codes.map((c) => ({ ...c, registrations: counts.get(c.code) ?? { completed: 0, started: 0 } })),
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`List promo codes failed: ${describeError(err)}`);
    return NextResponse.json({ error: "Couldn't reach Stripe. Check STRIPE_SECRET_KEY and try again." }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminAreaAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminAuthorized(req)) return NextResponse.json({ error: "Wrong admin code." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const fields: Record<string, string> = {};
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const percentOff = Number(body.percentOff);
  const maxUses = body.maxUses === null || body.maxUses === "" || body.maxUses === undefined ? null : Number(body.maxUses);
  const expiresAt = typeof body.expiresAt === "string" && body.expiresAt ? body.expiresAt : null;
  const ticketIds = Array.isArray(body.ticketIds) && body.ticketIds.length ? body.ticketIds.map(String) : null;

  if (code && !PROMO_CODE_RE.test(code)) fields.code = "3 to 40 letters, numbers, dashes or underscores. Leave empty to generate one.";
  if (!label) fields.label = "Say who it's for, e.g. \"AfSA sponsor passes\".";
  if (label.length > 200) fields.label = "Keep it under 200 characters.";
  if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 100) fields.percentOff = "A whole number from 1 to 100. 100 = free pass.";
  if (maxUses === null) fields.maxUses = "Say how many people can use this code, e.g. 10.";
  else if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100_000) fields.maxUses = "A whole number, at least 1.";
  if (expiresAt && !(new Date(expiresAt).getTime() > Date.now())) fields.expiresAt = "Pick a date in the future, or leave empty.";
  if (Object.keys(fields).length) return NextResponse.json({ error: "Check the highlighted fields.", fields }, { status: 400 });

  try {
    const promo = await createPromoCode({ code: code || undefined, label, percentOff, maxUses, expiresAt, ticketIds });
    return NextResponse.json({ code: promo });
  } catch (err) {
    const message = describeError(err);
    console.error(`Create promo code failed: ${message}`);
    if (/already exists|already in use|unique/i.test(message)) {
      return NextResponse.json({ error: "This code already exists.", fields: { code: "This code already exists. Choose another." } }, { status: 409 });
    }
    return NextResponse.json({ error: "Couldn't create the code in Stripe. Try again." }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAreaAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminAuthorized(req)) return NextResponse.json({ error: "Wrong admin code." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string" || typeof body.active !== "boolean") {
    return NextResponse.json({ error: "Missing id or active." }, { status: 400 });
  }
  try {
    const promo = await setPromoCodeActive(body.id, body.active);
    return NextResponse.json({ code: promo });
  } catch (err) {
    console.error(`Update promo code failed: ${describeError(err)}`);
    return NextResponse.json({ error: "Couldn't update the code in Stripe. Try again." }, { status: 502 });
  }
}

// Our own view of each code's use: completed registrations (paid, including
// free passes) and ones started but not paid yet. Stripe's own count only
// moves when a checkout completes, so "started" shows a use straight away.
async function registrationsPerCode(): Promise<Map<string, { completed: number; started: number }>> {
  const counts = new Map<string, { completed: number; started: number }>();
  const { data, error } = await supabaseAdmin()
    .from("attendees")
    .select("promo_code, payment_status")
    .not("promo_code", "is", null);
  if (error) {
    console.error(`Promo code counts failed: ${error.message}`);
    return counts;
  }
  for (const row of data ?? []) {
    const code = String(row.promo_code).toUpperCase();
    const c = counts.get(code) ?? { completed: 0, started: 0 };
    if (row.payment_status === "pending") c.started += 1;
    else c.completed += 1;
    counts.set(code, c);
  }
  return counts;
}
