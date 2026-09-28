// Ticket types sold on the public form. Prices are in the smallest currency
// unit (cents). Edit this list to add or change tickets — e.g. add a
// "Standard" ticket for when Early Bird closes.
//
// Discount/coupon codes are created in the Stripe dashboard (Products →
// Coupons → Promotion codes); the Stripe payment page shows a code box.

export interface Ticket {
  id: string;
  name: { en: string; fr: string };
  description: { en: string; fr: string };
  amountCents: number;
  currency: "eur";
  /** ISO date-time after which the ticket can no longer be bought. */
  availableUntil?: string;
}

export const TICKETS: Ticket[] = [
  {
    id: "early_bird",
    name: { en: "Early Bird", fr: "Tarif préférentiel (Early Bird)" },
    description: {
      en: "In-person attendance. Early Bird is open till 31st December, 2026.",
      fr: "Participation en présentiel. Tarif ouvert jusqu'au 31 décembre 2026.",
    },
    amountCents: 50_000,
    currency: "eur",
    // End of 31 Dec 2026 in Libreville/Lagos time (UTC+1).
    availableUntil: "2026-12-31T23:59:59+01:00",
  },
  {
    id: "virtual",
    name: { en: "Virtual Participation", fr: "Participation virtuelle" },
    description: { en: "For virtual delegates.", fr: "Pour les délégués en ligne." },
    amountCents: 30_000,
    currency: "eur",
  },
];

export function availableTickets(now: Date = new Date()): Ticket[] {
  return TICKETS.filter(
    (t) => !t.availableUntil || now.getTime() <= new Date(t.availableUntil).getTime()
  );
}

export function findAvailableTicket(id: string, now: Date = new Date()): Ticket | undefined {
  return availableTickets(now).find((t) => t.id === id);
}

export function formatPrice(amountCents: number, currency: string, locale = "en"): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100);
}
