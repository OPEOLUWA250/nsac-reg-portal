import crypto from "node:crypto";
import type Stripe from "stripe";
import { stripe } from "@/lib/payments";

export { discountedCents } from "@/lib/tickets";

// Promo codes (e.g. complimentary passes for sponsors), managed from
// /admin/promo-codes and stored in Stripe as a coupon (the % off) plus a
// promotion code (the code people type, its usage limit and expiry). Stripe
// counts each completed checkout as one use. Only codes created here (tagged
// with APP_TAG) are accepted by the form. Server-only.

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
  const coupon = p.promotion?.coupon;
  const percentOff = coupon && typeof coupon === "object" ? (coupon.percent_off ?? 0) : 0;
  // Its discount was deleted in Stripe: the code can never work again.
  if (!percentOff) return null;
  const tickets = p.metadata?.tickets?.trim();
  return {
    id: p.id,
    code: p.code,
    label: p.metadata?.label ?? "",
    percentOff,
    maxUses: p.max_redemptions,
    used: p.times_redeemed,
    expiresAt: p.expires_at ? new Date(p.expires_at * 1000).toISOString() : null,
    active: p.active,
    ticketIds: tickets ? tickets.split(",") : null,
    createdAt: new Date(p.created * 1000).toISOString(),
  };
}

export async function listPromoCodes(): Promise<PromoCode[]> {
  const out: PromoCode[] = [];
  for await (const p of stripe().promotionCodes.list({ limit: 100, expand: ["data.promotion.coupon"] })) {
    const promo = toPromoCode(p);
    if (promo) out.push(promo);
    if (out.length >= 500) break;
  }
  return out;
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

export async function createPromoCode(input: NewPromoCode): Promise<PromoCode> {
  const code = (input.code?.trim() || generateCode()).toUpperCase();
  const label = input.label.trim();
  const coupon = await stripe().coupons.create({
    percent_off: input.percentOff,
    duration: "once",
    // Shown on the Stripe payment page and receipt.
    name: (label ? `${label} (${input.percentOff}% off)` : `${input.percentOff}% off`).slice(0, 40),
    metadata: { app: APP_TAG },
  });
  const promo = await stripe().promotionCodes.create({
    promotion: { type: "coupon", coupon: coupon.id },
    code,
    ...(input.maxUses ? { max_redemptions: input.maxUses } : {}),
    ...(input.expiresAt ? { expires_at: Math.floor(new Date(input.expiresAt).getTime() / 1000) } : {}),
    metadata: { app: APP_TAG, label: label.slice(0, 200), tickets: input.ticketIds?.join(",") ?? "" },
    expand: ["promotion.coupon"],
  });
  return toPromoCode(promo)!;
}

export async function setPromoCodeActive(id: string, active: boolean): Promise<PromoCode | null> {
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
  if (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now()) return { ok: false, problem: "expired" };
  if (promo.maxUses !== null && promo.used >= promo.maxUses) return { ok: false, problem: "used_up" };
  if (!promo.active) return { ok: false, problem: "expired" };
  if (promo.ticketIds && !promo.ticketIds.includes(ticketId)) return { ok: false, problem: "not_for_ticket" };
  return { ok: true, promo };
}
