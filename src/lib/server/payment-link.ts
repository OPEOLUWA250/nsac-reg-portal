import "server-only";
import crypto from "node:crypto";
import { isRegistrationOpen } from "@/lib/registration-config";
import { availableTickets } from "@/lib/ticket-store";
import { checkPromoCode, type PromoCode } from "@/lib/promo-codes";
import { checkStudentCode } from "@/lib/student-codes";
import { discountedCents, STUDENT_TICKET_ID, type Ticket } from "@/lib/tickets";
import { describeError } from "@/lib/describe-error";
import { publicBaseUrl, toHttps } from "@/lib/public-url";
import type { Attendee } from "@/lib/types";

// The "Complete my payment" link in payment reminders: /pay/<id>.<signature>.
// The signature (an HMAC of the registration id) means only links we sent
// work, without storing anything. It is not the entry QR code, so a
// forwarded reminder never lets anyone in. The link works for as long as
// registration is open (Settings); after that the page says it's closed.
//
// The key is PAYMENT_LINK_SECRET, or else the Supabase service key (always
// set on the server). Changing it makes links already sent stop working.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function key(): string {
  const k = process.env.PAYMENT_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("Missing PAYMENT_LINK_SECRET (or SUPABASE_SERVICE_ROLE_KEY) environment variable");
  return k;
}

const sign = (id: string) => crypto.createHmac("sha256", key()).update(`payment-link:v1:${id.toLowerCase()}`).digest("base64url").slice(0, 32);

export function paymentLinkToken(attendeeId: string): string {
  return `${attendeeId}.${sign(attendeeId)}`;
}

/**
 * Where links in reminders point: the public address, except while someone
 * tries this out on their own computer (localhost), where only that copy may
 * have the payment page yet.
 */
export function linkBaseUrl(requestOrigin: string): string {
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(requestOrigin)) return requestOrigin;
  return publicBaseUrl() ?? toHttps(requestOrigin);
}

export function paymentLinkUrl(attendeeId: string, baseUrl: string): string {
  return `${baseUrl}/pay/${paymentLinkToken(attendeeId)}`;
}

/** The registration id in a link we sent, or null for anything else. */
export function attendeeIdFromToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  const id = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  if (dot < 0 || !UUID.test(id)) return null;
  const expected = Buffer.from(sign(id));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected) ? id : null;
}

/**
 * What the person can pay now. Always today's price: their ticket if it is
 * still on sale (with their code, if it still works), or else a choice of
 * the tickets on sale now.
 */
export type PaymentOffer =
  | {
      kind: "pay";
      ticket: Ticket;
      amountCents: number;
      promo: PromoCode | null;
      studentCode: string | null;
      /** Their code no longer works (used up, ended), so it isn't applied. */
      codeDropped: string | null;
    }
  | { kind: "choose"; tickets: Ticket[]; previousTicket: string | null }
  | { kind: "paid" }
  | { kind: "closed" };

export async function paymentOffer(attendee: Attendee, options: { ticketId?: string | null; now?: Date } = {}): Promise<PaymentOffer> {
  if (attendee.payment_status !== "pending") return { kind: "paid" };
  if (!(await isRegistrationOpen())) return { kind: "closed" };
  const onSale = await availableTickets(options.now);
  // Anyone can pick a ticket on sale, except the Student one, which needs their own code.
  const choices = onSale.filter((t) => t.id !== STUDENT_TICKET_ID);
  const wanted = options.ticketId ?? attendee.ticket_type;
  const ticket = onSale.find((t) => t.id === wanted);
  const code = attendee.promo_code?.trim() || null;

  if (ticket?.id === STUDENT_TICKET_ID) {
    const student = code ? await checkStudentCode(code, attendee.email).catch(() => null) : null;
    if (student?.ok) return { kind: "pay", ticket, amountCents: ticket.amountCents, promo: null, studentCode: code, codeDropped: null };
  } else if (ticket && (!options.ticketId || choices.includes(ticket))) {
    let promo: PromoCode | null = null;
    if (code) {
      try {
        const check = await checkPromoCode(code, ticket.id);
        if (check.ok) promo = check.promo;
      } catch (err) {
        console.warn(`Payment link: couldn't check code ${code}: ${describeError(err)}`);
      }
    }
    const amountCents = promo ? discountedCents(ticket.amountCents, promo.percentOff) : ticket.amountCents;
    return { kind: "pay", ticket, amountCents, promo, studentCode: null, codeDropped: code && !promo ? code : null };
  }

  if (!choices.length) return { kind: "closed" };
  return { kind: "choose", tickets: choices, previousTicket: attendee.ticket_type };
}
