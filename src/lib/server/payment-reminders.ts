import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { describeError } from "@/lib/describe-error";
import { buildPaymentReminderEmail, sendPaymentReminderEmail } from "@/lib/email";
import { paymentLinkUrl, paymentOffer } from "@/lib/server/payment-link";
import { formatPrice, type Ticket } from "@/lib/tickets";
import { fillTemplate, firstNameOf, reminderLanguage, type ReminderLanguage, type ReminderTemplate } from "@/lib/payment-reminder";
import type { Attendee } from "@/lib/types";

// Builds and sends payment reminders (src/lib/payment-reminder.ts) for the
// admin route and the daily automatic run, and records them on the attendee.

const NOTES = {
  en: {
    choose: "This ticket is no longer on sale. The button lets you choose from the tickets on sale now, at today's prices.",
    todaysPrice: "today's price",
    codeApplied: (code: string) => `Your code ${code} is applied.`,
    codeDropped: (code: string) => `Your code ${code} has ended, so this is the full price.`,
  },
  fr: {
    choose: "Ce billet n'est plus en vente. Le bouton vous permet de choisir parmi les billets en vente, aux tarifs actuels.",
    todaysPrice: "au tarif actuel",
    codeApplied: (code: string) => `Votre code ${code} est appliqué.`,
    codeDropped: (code: string) => `Votre code ${code} n'est plus valable : il s'agit du plein tarif.`,
  },
} as const;

export interface ReminderWording {
  templates: Record<ReminderLanguage, ReminderTemplate>;
  signedBy?: string | null;
  signerTitle?: string | null;
}

export type PreparedReminder =
  | { ok: true; language: ReminderLanguage; email: Omit<Parameters<typeof buildPaymentReminderEmail>[0], "hasLogo"> }
  | { ok: false; reason: "paid" | "closed" };

/** Ticket name in the email's language, from the full list (tickets off sale included). */
function ticketLabel(id: string | null, tickets: Ticket[], language: ReminderLanguage): string {
  const t = tickets.find((x) => x.id === id);
  return t ? t.name[language] || t.name.en : id ? id.replace(/_/g, " ") : "";
}

/** The email for one person, at today's price, or why there is nothing to send. */
export async function prepareReminder(attendee: Attendee, wording: ReminderWording, tickets: Ticket[], baseUrl: string): Promise<PreparedReminder> {
  const offer = await paymentOffer(attendee);
  if (offer.kind === "paid" || offer.kind === "closed") return { ok: false, reason: offer.kind };
  const language = reminderLanguage(attendee);
  const n = NOTES[language];
  let ticket: string;
  let price: string | null;
  let note: string | null;
  if (offer.kind === "pay") {
    ticket = offer.ticket.name[language] || offer.ticket.name.en;
    price = formatPrice(offer.amountCents, offer.ticket.currency, language);
    note = offer.promo ? n.codeApplied(offer.promo.code) : offer.codeDropped ? n.codeDropped(offer.codeDropped) : null;
  } else {
    ticket = ticketLabel(attendee.ticket_type, tickets, language);
    price = null;
    note = n.choose;
  }
  const values = { firstName: firstNameOf(attendee), ticket, price: price ?? n.todaysPrice };
  const template = wording.templates[language];
  return {
    ok: true,
    language,
    email: {
      subject: fillTemplate(template.subject, values),
      message: fillTemplate(template.message, values),
      payUrl: paymentLinkUrl(attendee.id, baseUrl),
      ticket,
      price,
      note,
      signedBy: wording.signedBy || null,
      signerTitle: wording.signerTitle || null,
      language,
    },
  };
}

export async function sendReminder(
  attendee: Attendee,
  prepared: Extract<PreparedReminder, { ok: true }>,
  delivery: { replyTo?: string | null; bcc?: string | null; logoPngBuffer?: Buffer | null }
): Promise<void> {
  await sendPaymentReminderEmail({ toEmail: attendee.email, ...delivery, ...prepared.email });
}

// The reminder columns aren't there yet (the SQL wasn't run).
export const missingColumn = (err: unknown) => ["42703", "PGRST204"].includes((err as { code?: string } | null)?.code ?? "");

/**
 * Notes the reminder on the registration: when, by whom ("automatic" for the
 * daily run) and how many so far. Returns the updated row, or null when the
 * columns don't exist yet (the email has gone either way).
 */
export async function recordReminder(attendee: Attendee, sentBy: string): Promise<Attendee | null> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("attendees")
      .update({
        payment_reminder_sent_at: new Date().toISOString(),
        payment_reminder_sent_by: sentBy,
        payment_reminder_count: (attendee.payment_reminder_count ?? 0) + 1,
      })
      .eq("id", attendee.id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return (data as Attendee | null) ?? null;
  } catch (err) {
    if (!missingColumn(err)) console.error(`Couldn't record the payment reminder for ${attendee.id}: ${describeError(err)}`);
    return null;
  }
}
