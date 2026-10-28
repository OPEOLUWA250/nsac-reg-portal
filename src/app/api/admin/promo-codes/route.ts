import { NextRequest, NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/admin-auth";
import {
  createPromoCode,
  getPromoCode,
  listPromoCodes,
  needsNewStripeCode,
  setPromoCodeActive,
  updatePromoCode,
} from "@/lib/promo-codes";
import { PROMO_CODE_RE } from "@/lib/registration-fields";
import { describeError } from "@/lib/describe-error";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { listTickets } from "@/lib/ticket-store";
import { STUDENT_TICKET_ID } from "@/lib/tickets";
import { logActivity } from "@/lib/server/activity-log";
import type { AdminSession } from "@/lib/server/admin-auth";

const describe = (p: { code: string; label: string; percentOff: number; maxUses: number | null }) =>
  `${p.code} (${p.percentOff === 100 ? "free pass" : `${p.percentOff}% off`}, ${p.maxUses ?? "unlimited"} uses, "${p.label}")`;

export const runtime = "nodejs";

// /admin/promo-codes: list (GET), create (POST), switch on/off or edit (PATCH).
// Super admins only: seeing a free-pass code is as good as having one.

export const GET = adminRoute(async () => {
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
}, { superAdmin: true });

// The fields a code is created or edited with, checked. Every code names the
// tickets it works with (the form starts on Standard), so a free pass can't
// silently apply to every ticket.
async function readChanges(body: Record<string, unknown>) {
  const fields: Record<string, string> = {};
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const percentOff = Number(body.percentOff);
  const maxUses = body.maxUses === null || body.maxUses === "" || body.maxUses === undefined ? null : Number(body.maxUses);
  const expiresAt = typeof body.expiresAt === "string" && body.expiresAt ? body.expiresAt : null;
  const ticketIds: string[] = Array.isArray(body.ticketIds) ? [...new Set<string>(body.ticketIds.map(String))] : [];
  // Not the Student ticket: its price is fixed (student codes unlock it).
  const knownTickets = (await listTickets()).map((t) => t.id).filter((id) => id !== STUDENT_TICKET_ID);

  if (!label) fields.label = "Say who it's for, e.g. \"AfSA sponsor passes\".";
  if (label.length > 200) fields.label = "Keep it under 200 characters.";
  if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 100) fields.percentOff = "A whole number from 1 to 100. 100 = free pass.";
  if (maxUses === null) fields.maxUses = "Say how many people can use this code, e.g. 10.";
  else if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100_000) fields.maxUses = "A whole number, at least 1.";
  if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) fields.expiresAt = "Pick a date, or leave empty.";
  if (!ticketIds.length) fields.ticketIds = "Tick at least one ticket.";
  else if (ticketIds.some((id) => !knownTickets.includes(id))) fields.ticketIds = "Tick tickets from the list.";
  return { changes: { label, percentOff, maxUses, expiresAt, ticketIds }, fields };
}

const inFuture = (iso: string | null) => !iso || new Date(iso).getTime() > Date.now();

const invalid = (fields: Record<string, string>) =>
  NextResponse.json({ error: "Check the highlighted fields.", fields }, { status: 400 });

const ticketsUnavailable = (err: unknown) => {
  console.error(`Load tickets for promo code failed: ${describeError(err)}`);
  return NextResponse.json({ error: "Couldn't load the tickets. Try again." }, { status: 500 });
};

export const POST = adminRoute(async (req: NextRequest, _context, session) => {
  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  let read: Awaited<ReturnType<typeof readChanges>>;
  try {
    read = await readChanges(body);
  } catch (err) {
    return ticketsUnavailable(err);
  }
  const { changes, fields } = read;
  if (code && !PROMO_CODE_RE.test(code)) fields.code = "3 to 40 letters, numbers, dashes or underscores. Leave empty to generate one.";
  if (!fields.expiresAt && !inFuture(changes.expiresAt)) fields.expiresAt = "Pick a date in the future, or leave empty.";
  if (Object.keys(fields).length) return invalid(fields);

  try {
    const promo = await createPromoCode({ code: code || undefined, ...changes });
    await logActivity(
      session,
      { area: "promo_codes", action: "promo.created", summary: `created promo code ${describe(promo)}`, target: { type: "promo_code", id: promo.id }, details: { ticketIds: promo.ticketIds, expiresAt: promo.expiresAt } },
      req
    );
    return NextResponse.json({ code: promo });
  } catch (err) {
    const message = describeError(err);
    console.error(`Create promo code failed: ${message}`);
    if (/already exists|already in use|unique/i.test(message)) {
      return NextResponse.json({ error: "This code already exists.", fields: { code: "This code already exists. Choose another." } }, { status: 409 });
    }
    return NextResponse.json({ error: "Couldn't create the code in Stripe. Try again." }, { status: 502 });
  }
}, { superAdmin: true });

// { id, active } switches a code on or off; { id, label, percentOff, maxUses,
// expiresAt, ticketIds } edits it (the code itself stays the same).
export const PATCH = adminRoute(async (req: NextRequest, _context, session) => {
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string") return NextResponse.json({ error: "Missing id." }, { status: 400 });
  if (typeof body.active !== "boolean") return edit(req, session, body.id, body);
  try {
    const promo = await setPromoCodeActive(body.id, body.active);
    if (!promo) return NextResponse.json({ error: "No such promo code." }, { status: 404 });
    await logActivity(
      session,
      { area: "promo_codes", action: body.active ? "promo.on" : "promo.off", summary: `switched promo code ${promo.code} ${body.active ? "on" : "off"}`, target: { type: "promo_code", id: promo.id } },
      req
    );
    return NextResponse.json({ code: promo });
  } catch (err) {
    console.error(`Update promo code failed: ${describeError(err)}`);
    return NextResponse.json({ error: "Couldn't update the code in Stripe. Try again." }, { status: 502 });
  }
}, { superAdmin: true });

async function edit(req: NextRequest, session: AdminSession, id: string, body: Record<string, unknown>) {
  let read: Awaited<ReturnType<typeof readChanges>>;
  try {
    read = await readChanges(body);
  } catch (err) {
    return ticketsUnavailable(err);
  }
  const { changes, fields } = read;
  try {
    const current = await getPromoCode(id);
    if (!current) return NextResponse.json({ error: "No such promo code. Refresh the page." }, { status: 404 });
    if (!fields.maxUses && changes.maxUses !== null && changes.maxUses < current.used) {
      fields.maxUses = `It has been used ${current.used} ${current.used === 1 ? "time" : "times"}, so at least ${current.used}.`;
    }
    // A date already passed can stay if it isn't being changed (and nothing
    // else needs a new Stripe code); Stripe takes only future dates.
    if (!fields.expiresAt && !inFuture(changes.expiresAt) && needsNewStripeCode(current, changes)) {
      fields.expiresAt = "Pick a date in the future, or leave empty.";
    }
    if (Object.keys(fields).length) return invalid(fields);
    const promo = await updatePromoCode(current, changes);
    await logActivity(
      session,
      { area: "promo_codes", action: "promo.edited", summary: `edited promo code ${describe(promo)}`, target: { type: "promo_code", id: promo.id }, details: { before: describe(current) } },
      req
    );
    return NextResponse.json({ code: promo });
  } catch (err) {
    console.error(`Edit promo code failed: ${describeError(err)}`);
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
