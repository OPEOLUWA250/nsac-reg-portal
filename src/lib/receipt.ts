import { EVENT_INFO } from "@/lib/event-info";
import { categoryName } from "@/lib/email";
import type { Attendee } from "@/lib/types";

// The payment receipt: what was paid, by whom, for which ticket, with the
// Stripe payment ID, for the attendee's accounts department. In English or
// French. Attached to the confirmation email and re-sent from the dashboard.
// The PDF is drawn by src/lib/server/receipt-pdf.ts; everything it says is
// worked out here (plain text, no HTML).

export type ReceiptLanguage = "en" | "fr";

/** Who received the money: the Stripe account the ticket was paid to. */
export const RECEIPT_ISSUER = {
  name: "Space in Africa",
  website: "spaceinafrica.com",
} as const;

export interface ReceiptContent {
  language: ReceiptLanguage;
  title: string;
  paid: string;
  /** [label, value] pairs under the title: receipt number and date. */
  meta: [string, string][];
  fromTitle: string;
  from: string[];
  issuerTitle: string;
  issuer: string[];
  columns: [string, string];
  item: { description: string; details: string[]; amount: string };
  totalLabel: string;
  total: string;
  paymentTitle: string;
  payment: [string, string][];
  note: string;
  footer: string;
  /** For the email that carries it: the same facts, in short. */
  summary: [string, string][];
}

const COPY = {
  en: {
    title: "Payment receipt",
    paid: "PAID",
    number: "Receipt No.",
    date: "Date",
    fromTitle: "Received from",
    issuerTitle: "Issued by",
    organiser: "Organiser of the conference",
    colon: ": ",
    vat: "VAT number",
    reference: "Your reference",
    columns: ["Description", "Amount"] as [string, string],
    ticket: (event: string, ticket: string) => `${event}: ${ticket} ticket`,
    category: "Registration category",
    promo: "Promo code",
    totalLabel: "Total paid",
    paymentTitle: "Payment details",
    method: "Payment method",
    methodValue: "Online payment (Stripe)",
    paymentId: "Payment ID",
    paidOn: "Paid on",
    note: "This receipt confirms that the payment above has been received in full.",
    amount: "Amount paid",
    ticketLabel: "Ticket",
  },
  fr: {
    title: "Reçu de paiement",
    paid: "PAYÉ",
    number: "Reçu n°",
    date: "Date",
    fromTitle: "Reçu de",
    issuerTitle: "Émis par",
    organiser: "Organisateur de la conférence",
    // French puts a space before a colon.
    colon: " : ",
    vat: "N° de TVA",
    reference: "Votre référence",
    columns: ["Description", "Montant"] as [string, string],
    // The ticket's name in quotes: « Tarif préférentiel (Early Bird) ».
    ticket: (event: string, ticket: string) => `${event} : billet « ${ticket} »`,
    category: "Catégorie d’inscription",
    promo: "Code promo",
    totalLabel: "Total payé",
    paymentTitle: "Détails du paiement",
    method: "Moyen de paiement",
    methodValue: "Paiement en ligne (Stripe)",
    paymentId: "ID de paiement",
    paidOn: "Payé le",
    note: "Ce reçu confirme que le paiement ci-dessus a été reçu en totalité.",
    amount: "Montant payé",
    ticketLabel: "Billet",
  },
} as const;

const LOCALE: Record<ReceiptLanguage, string> = { en: "en-GB", fr: "fr-FR" };

// Intl puts narrow and non-breaking spaces in French amounts ("500,00 €"),
// which the PDF fonts may not have: plain spaces print the same.
const plainSpaces = (s: string) => s.replace(/[  ]/g, " ");

export function formatAmount(cents: number, currency: string, language: ReceiptLanguage): string {
  return plainSpaces(
    new Intl.NumberFormat(LOCALE[language], { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: 2 }).format(cents / 100)
  );
}

function formatDate(iso: string, language: ReceiptLanguage): string {
  return plainSpaces(new Intl.DateTimeFormat(LOCALE[language], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso)));
}

/**
 * "NSAC27-RCT-8F3C2A10": from the registration's random id, the same every
 * time it's sent. Never the registration number: a receipt must not show how
 * many people have registered.
 */
export function receiptNumber(a: Pick<Attendee, "id">): string {
  return `NSAC27-RCT-${a.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/** "newspace-africa-2027-receipt-NSAC27-RCT-8F3C2A10.pdf". */
export function receiptFilename(a: Pick<Attendee, "id">): string {
  return `newspace-africa-2027-receipt-${receiptNumber(a)}.pdf`;
}

export function receiptLanguage(a: Pick<Attendee, "language">): ReceiptLanguage {
  return a.language === "fr" ? "fr" : "en";
}

/**
 * Everything the receipt says. Call only when hasReceipt(attendee).
 * `ticketName` in the receipt's language; `paymentId` is Stripe's (pi_…),
 * left out when Stripe couldn't be asked.
 */
export function buildReceiptContent(
  a: Attendee,
  { ticketName, paymentId, language = receiptLanguage(a) }: { ticketName: string; paymentId: string | null; language?: ReceiptLanguage }
): ReceiptContent {
  const t = COPY[language];
  const event = EVENT_INFO.name[language];
  const amount = formatAmount(a.amount_cents ?? 0, a.currency ?? "eur", language);
  const paidAt = a.paid_at ?? a.updated_at;
  const date = formatDate(paidAt, language);
  const number = receiptNumber(a);
  const category = categoryName(String(a.role || "delegate"), language);
  const organisation = [a.organization?.trim(), a.organization_country?.trim()].filter(Boolean).join(", ");

  return {
    language,
    title: t.title,
    paid: t.paid,
    meta: [
      [t.number, number],
      [t.date, date],
    ],
    fromTitle: t.fromTitle,
    from: [
      a.full_name.trim(),
      ...(a.job_title?.trim() ? [a.job_title.trim()] : []),
      ...(organisation ? [organisation] : []),
      a.email,
      ...(a.vat_number?.trim() ? [`${t.vat}${t.colon}${a.vat_number.trim()}`] : []),
      ...(a.invoice_reference?.trim() ? [`${t.reference}${t.colon}${a.invoice_reference.trim()}`] : []),
    ],
    issuerTitle: t.issuerTitle,
    issuer: [RECEIPT_ISSUER.name, t.organiser, RECEIPT_ISSUER.website],
    columns: t.columns,
    item: {
      description: t.ticket(event, ticketName),
      details: [
        `${EVENT_INFO.date[language]} · ${EVENT_INFO.place[language]}`,
        `${t.category}${t.colon}${category}`,
        ...(a.promo_code ? [`${t.promo}${t.colon}${a.promo_code}`] : []),
      ],
      amount,
    },
    totalLabel: t.totalLabel,
    total: amount,
    paymentTitle: t.paymentTitle,
    payment: [
      [t.method, t.methodValue],
      ...(paymentId ? ([[t.paymentId, paymentId]] as [string, string][]) : []),
      [t.paidOn, date],
    ],
    note: t.note,
    footer: `${event} · ${EVENT_INFO.date[language]} · ${EVENT_INFO.place[language]}`,
    summary: [
      [t.number, number],
      [t.ticketLabel, ticketName],
      [t.amount, amount],
      [t.paidOn, date],
      ...(paymentId ? ([[t.paymentId, paymentId]] as [string, string][]) : []),
    ],
  };
}
