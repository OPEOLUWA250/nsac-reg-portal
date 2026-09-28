// Ticket types sold on the public form. They live in the Supabase `tickets`
// table and are edited from /admin → "Tickets & prices" (see
// src/lib/ticket-store.ts for the server side). Prices are in the smallest
// currency unit (cents).
//
// Discount/coupon codes are created in the Stripe dashboard (Products →
// Coupons → Promotion codes); the Stripe payment page shows a code box.
//
// This file is safe to import from the browser.

export interface Ticket {
  id: string;
  name: { en: string; fr: string };
  description: { en: string; fr: string };
  amountCents: number;
  currency: string;
  /** ISO date-time after which the ticket can no longer be bought. */
  availableUntil: string | null;
  /** Unticked in the admin = hidden from the form. */
  active: boolean;
  sortOrder: number;
}

/** Stripe won't charge less than €0.50. */
export const MIN_PRICE_CENTS = 50;
export const MAX_PRICE_CENTS = 10_000_000;
export const TICKET_ID_RE = /^[a-z0-9_]{2,40}$/;

export function isOnSale(ticket: Ticket, now: Date = new Date()): boolean {
  if (!ticket.active) return false;
  return !ticket.availableUntil || now.getTime() <= new Date(ticket.availableUntil).getTime();
}

export function formatPrice(amountCents: number, currency: string, locale = "en"): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100);
}
