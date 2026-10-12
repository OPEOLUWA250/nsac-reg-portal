import crypto from "node:crypto";
import type Stripe from "stripe";
import { stripe, ticketProduct } from "@/lib/payments";
import { STUDENT_TICKET_ID } from "@/lib/tickets";

export { discountedCents } from "@/lib/tickets";

// Promo codes (e.g. complimentary passes for sponsors), managed from
// /admin/promo-codes and stored in Stripe as a coupon (the % off) plus a
// promotion code (the code people type, its usage limit and expiry). Stripe
// counts each completed checkout as one use. Only codes created here (tagged
// with APP_TAG) are accepted by the form. Server-only.
//
// Stripe can't change a promotion code's discount, limit or expiry, so an
// edit to those switches the old one off (tagged "replaced", hidden from
// then on) and creates a new one with the same code. The new one carries the
// old one's uses (metadata used_before) and the full limit (max_uses), so the
// admin page and the form's check see one code all along.

const APP_TAG = "nsac-reg-portal";

export interface PromoCode {
  id: string;
  code: string;
  /** Who it's for, e.g. "AfSA sponsor passes". */
  label: string;
  percentOff: number;
  maxUses: number | null;
  used: number;
  /** ISO date-time, or null for no end. */
  expiresAt: string | null;
  active: boolean;
  /** Ticket ids it works with, or null for every ticket. */
  ticketIds: string[] | null;
  createdAt: string;
}

export type PromoProblem = "unknown" | "expired" | "used_up" | "not_for_ticket";

function toPromoCode(p: Stripe.PromotionCode): PromoCode | null {
  if (p.metadata?.app !== APP_TAG) return null;
  // An earlier version of an edited code: the new one stands in for it.
  if (p.metadata?.replaced) return null;
  const coupon = p.promotion?.coupon;
  const percentOff = coupon && typeof coupon === "object" ? (coupon.percent_off ?? 0) : 0;
  // Its discount was deleted in Stripe: the code can never work again.
  if (!percentOff) return null;
  const tickets = p.metadata?.tickets?.trim();
  const usedBefore = Number(p.metadata?.used_before) || 0;
  const maxUses = Number(p.metadata?.max_uses) || null;
  return {
    id: p.id,
    code: p.code,
    label: p.metadata?.label ?? "",
    percentOff,
    maxUses: maxUses ?? p.max_redemptions,
    used: usedBefore + p.times_redeemed,
    expiresAt: p.expires_at ? new Date(p.expires_at * 1000).toISOString() : null,
    active: p.active,
    ticketIds: tickets ? tickets.split(",") : null,
    createdAt: p.metadata?.created_at || new Date(p.created * 1000).toISOString(),
  };
}

export async function listPromoCodes(): Promise<PromoCode[]> {
  const out: PromoCode[] = [];
  for await (const p of stripe().promotionCodes.list({ limit: 100, expand: ["data.promotion.coupon"] })) {
    const promo = toPromoCode(p);
    if (promo) out.push(promo);
    if (out.length >= 500) break;
  }
  // Newest first by when the code was first made, so an edit doesn't move it.
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** One of our codes, or null for any other promotion code in the account. */
export async function getPromoCode(id: string): Promise<PromoCode | null> {
  return toPromoCode(await stripe().promotionCodes.retrieve(id, { expand: ["promotion.coupon"] }));
}

// NSAC-7K3QXP: no 0/O or 1/I, so codes read out loud or copied by hand work.
function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  return "NSAC-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export interface NewPromoCode {
  code?: string;
  label: string;
  percentOff: number;
  maxUses: number | null;
  expiresAt: string | null;
  ticketIds: string[] | null;
}

// Shown on the Stripe payment page and receipt.
const couponName = (label: string, percentOff: number) =>
  (label ? `${label} (${percentOff}% off)` : `${percentOff}% off`).slice(0, 40);

async function createCoupon(label: string, percentOff: number): Promise<string> {
  const coupon = await stripe().coupons.create({
    percent_off: percentOff,
    duration: "once",
    // Conference tickets only: the Stripe account also sells for the Space in
    // Africa website, where this code must not work (payments.ts).
    applies_to: { products: [await ticketProduct()] },
    name: couponName(label, percentOff),
    metadata: { app: APP_TAG },
  });
  return coupon.id;
}

const unixTime = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

export async function createPromoCode(input: NewPromoCode): Promise<PromoCode> {
  const code = (input.code?.trim() || generateCode()).toUpperCase();
  const label = input.label.trim();
  const promo = await stripe().promotionCodes.create({
    promotion: { type: "coupon", coupon: await createCoupon(label, input.percentOff) },
    code,
    ...(input.maxUses ? { max_redemptions: input.maxUses } : {}),
    ...(input.expiresAt ? { expires_at: unixTime(input.expiresAt) } : {}),
    metadata: { app: APP_TAG, label: label.slice(0, 200), tickets: input.ticketIds?.join(",") ?? "" },
    expand: ["promotion.coupon"],
  });
  return toPromoCode(promo)!;
}

export type PromoCodeChanges = Omit<NewPromoCode, "code" | "ticketIds"> & { ticketIds: string[] };

/** True when the edit needs a new Stripe promotion code (see the top of this file). */
export function needsNewStripeCode(current: PromoCode, changes: PromoCodeChanges): boolean {
  const seconds = (iso: string | null) => (iso ? unixTime(iso) : null);
  return (
    changes.percentOff !== current.percentOff ||
    changes.maxUses !== current.maxUses ||
    seconds(changes.expiresAt) !== seconds(current.expiresAt)
  );
}

/**
 * Edits one of our codes, keeping the code people were sent and its uses so
 * far. The caller checks the changes first: maxUses at least `used`, and a
 * future expiry if needsNewStripeCode.
 */
export async function updatePromoCode(current: PromoCode, changes: PromoCodeChanges): Promise<PromoCode> {
  const label = changes.label.trim();
  const tickets = changes.ticketIds.join(",");
  const raw = await stripe().promotionCodes.retrieve(current.id, { expand: ["promotion.coupon"] });
  const coupon = raw.promotion?.coupon;
  const couponId = typeof coupon === "string" ? coupon : coupon?.id;

  if (!needsNewStripeCode(current, changes)) {
    // Who it's for and the tickets live in metadata, which Stripe can change.
    if (couponId && label !== current.label) {
      await stripe().coupons.update(couponId, { name: couponName(label, current.percentOff) });
    }
    const promo = await stripe().promotionCodes.update(current.id, {
      metadata: { label: label.slice(0, 200), tickets },
      expand: ["promotion.coupon"],
    });
    return toPromoCode(promo)!;
  }

  const newCouponId =
    changes.percentOff === current.percentOff && couponId ? couponId : await createCoupon(label, changes.percentOff);
  if (newCouponId === couponId && label !== current.label) {
    await stripe().coupons.update(couponId, { name: couponName(label, changes.percentOff) });
  }

  // Codes must be unique among active ones, so the old one goes off first.
  await stripe().promotionCodes.update(current.id, { active: false, metadata: { replaced: "true" } });
  try {
    const promo = await stripe().promotionCodes.create({
      promotion: { type: "coupon", coupon: newCouponId },
      code: current.code,
      active: current.active,
      // Stripe's own limit counts only this new code's uses (at least 1); the
      // form's check holds the code to the full limit (checkPromoCode).
      ...(changes.maxUses ? { max_redemptions: Math.max(1, changes.maxUses - current.used) } : {}),
      ...(changes.expiresAt ? { expires_at: unixTime(changes.expiresAt) } : {}),
      metadata: {
        app: APP_TAG,
        label: label.slice(0, 200),
        tickets,
        used_before: String(current.used),
        max_uses: changes.maxUses ? String(changes.maxUses) : "",
        created_at: current.createdAt,
        replaces: current.id,
      },
      expand: ["promotion.coupon"],
    });
    return toPromoCode(promo)!;
  } catch (err) {
    // Put the old one back as it was, so the code keeps working.
    await stripe()
      .promotionCodes.update(current.id, { active: current.active, metadata: { replaced: "" } })
      .catch(() => {});
    throw err;
  }
}

/** Turns one of our codes on or off. Null (and nothing changed) for any other promotion code in the account. */
export async function setPromoCodeActive(id: string, active: boolean): Promise<PromoCode | null> {
  const current = await stripe().promotionCodes.retrieve(id, { expand: ["promotion.coupon"] });
  if (!toPromoCode(current)) return null;
  const promo = await stripe().promotionCodes.update(id, { active, expand: ["promotion.coupon"] });
  return toPromoCode(promo);
}

/** Looks up a code typed on the form and checks it can be used for this ticket. */
export async function checkPromoCode(
  code: string,
  ticketId: string
): Promise<{ ok: true; promo: PromoCode } | { ok: false; problem: PromoProblem }> {
  const found = await stripe().promotionCodes.list({ code, limit: 10, expand: ["data.promotion.coupon"] });
  const all = found.data.map(toPromoCode).filter((p): p is PromoCode => p !== null);
  const promo = all.find((p) => p.active) ?? all[0];
  if (!promo) return { ok: false, problem: "unknown" };
  // The Student ticket's price is fixed, whatever the code says it works with.
  if (ticketId === STUDENT_TICKET_ID) return { ok: false, problem: "not_for_ticket" };
  if (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now()) return { ok: false, problem: "expired" };
  if (promo.maxUses !== null && promo.used >= promo.maxUses) return { ok: false, problem: "used_up" };
  if (!promo.active) return { ok: false, problem: "expired" };
  if (promo.ticketIds && !promo.ticketIds.includes(ticketId)) return { ok: false, problem: "not_for_ticket" };
  return { ok: true, promo };
}
