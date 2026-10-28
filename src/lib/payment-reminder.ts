import type { Attendee } from "@/lib/types";

// Payment reminders: an email to someone who filled in the form but didn't
// finish paying, with a button back to payment (/pay/<link>, which makes a
// fresh Stripe page at the current price). Sent by an admin from the
// dashboard, one person or everyone awaiting payment, or once automatically
// when switched on in Settings. Safe to import from the browser.

export type ReminderLanguage = "en" | "fr";

export interface ReminderTemplate {
  subject: string;
  message: string;
}

/** The words filled in for each person. Shown to admins as typed here. */
export const PLACEHOLDERS = { firstName: "{first name}", ticket: "{ticket}", price: "{price}" } as const;

export const DEFAULT_TEMPLATES: Record<ReminderLanguage, ReminderTemplate> = {
  en: {
    subject: "Complete your registration for the NewSpace Africa Conference 2027",
    message: [
      "Dear {first name},",
      "Thank you for starting your registration for the NewSpace Africa Conference 2027. Your payment for the {ticket} ticket wasn't completed, so your place isn't confirmed yet.",
      "Your details are saved: you only need to pay, which takes a couple of minutes. Use the button below. As soon as your payment goes through, you'll receive your confirmation and your entry QR code.",
    ].join("\n\n"),
  },
  fr: {
    subject: "Finalisez votre inscription à la Conférence NewSpace Africa 2027",
    message: [
      "Bonjour {first name},",
      "Merci d'avoir commencé votre inscription à la Conférence NewSpace Africa 2027. Le paiement de votre billet {ticket} n'a pas été finalisé : votre place n'est donc pas encore confirmée.",
      "Vos informations sont enregistrées : il ne vous reste qu'à payer, ce qui prend quelques minutes. Utilisez le bouton ci-dessous. Dès que votre paiement sera validé, vous recevrez votre confirmation et votre QR code d'accès.",
    ].join("\n\n"),
  },
};

export const REMINDER_LIMITS = { subject: 150, message: 4000, email: 254, name: 80, title: 80, people: 200 } as const;

/** Days after registering before the automatic reminder goes out. */
export const AUTO_REMINDER_DAYS = { min: 1, max: 30, default: 2 } as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ReminderInput {
  templates: Record<ReminderLanguage, ReminderTemplate>;
  /** Where replies go (Reply-To). */
  replyTo: string;
  signedBy: string;
  signerTitle: string;
  copyToSender: boolean;
}

export type ReminderFieldErrors = Partial<Record<"replyTo" | "signedBy" | "signerTitle" | `${ReminderLanguage}.${keyof ReminderTemplate}`, string>>;

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Checks what an admin typed (in the browser as they type, and again on the server). */
export function parseReminderInput(raw: unknown): { value: ReminderInput } | { fields: ReminderFieldErrors } {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fields: ReminderFieldErrors = {};
  const replyTo = text(body.replyTo);
  const signedBy = text(body.signedBy);
  const signerTitle = text(body.signerTitle);
  if (!replyTo) fields.replyTo = "Enter the email address replies should go to.";
  else if (!EMAIL_RE.test(replyTo) || replyTo.length > REMINDER_LIMITS.email) fields.replyTo = "This doesn't look like an email address.";
  if (signedBy.length > REMINDER_LIMITS.name) fields.signedBy = `Keep it under ${REMINDER_LIMITS.name} characters.`;
  if (signerTitle.length > REMINDER_LIMITS.title) fields.signerTitle = `Keep it under ${REMINDER_LIMITS.title} characters.`;

  const rawTemplates = (body.templates && typeof body.templates === "object" ? body.templates : {}) as Record<string, unknown>;
  const templates = {} as Record<ReminderLanguage, ReminderTemplate>;
  for (const lang of ["en", "fr"] as const) {
    const t = (rawTemplates[lang] && typeof rawTemplates[lang] === "object" ? rawTemplates[lang] : {}) as Record<string, unknown>;
    const subject = text(t.subject);
    // Keep the message's own line breaks; only trim the ends.
    const message = typeof t.message === "string" ? t.message.replace(/\r\n?/g, "\n").trim() : "";
    if (!subject) fields[`${lang}.subject`] = "Enter a subject.";
    else if (subject.length > REMINDER_LIMITS.subject) fields[`${lang}.subject`] = `Keep it under ${REMINDER_LIMITS.subject} characters.`;
    if (!message) fields[`${lang}.message`] = "Write the message.";
    else if (message.length > REMINDER_LIMITS.message) fields[`${lang}.message`] = `Keep it under ${REMINDER_LIMITS.message} characters.`;
    templates[lang] = { subject, message };
  }
  if (Object.keys(fields).length) return { fields };
  return { value: { templates, replyTo, signedBy, signerTitle, copyToSender: body.copyToSender !== false } };
}

/** Puts each person's details in place of the placeholders. Plain text: escaping is the email's job. */
export function fillTemplate(template: string, values: { firstName: string; ticket: string; price: string }): string {
  return template
    .replaceAll(PLACEHOLDERS.firstName, values.firstName)
    .replaceAll(PLACEHOLDERS.ticket, values.ticket)
    .replaceAll(PLACEHOLDERS.price, values.price);
}

export function reminderLanguage(a: Pick<Attendee, "language">): ReminderLanguage {
  return a.language === "fr" ? "fr" : "en";
}

/** "Ada" from "Ada Obi", falling back to the full name. */
export function firstNameOf(a: Pick<Attendee, "first_name" | "full_name">): string {
  return a.first_name?.trim() || a.full_name.trim().split(/\s+/)[0] || a.full_name;
}

/** Someone reminded this recently gets a "send another?" check first. */
export const RECENT_REMINDER_MS = 24 * 3600_000;

export function remindedRecently(a: Pick<Attendee, "payment_reminder_sent_at">, now = Date.now()): boolean {
  return Boolean(a.payment_reminder_sent_at && now - new Date(a.payment_reminder_sent_at).getTime() < RECENT_REMINDER_MS);
}

/** Who sent the last reminder, for display: an email, or the automatic job. */
export const AUTOMATIC_SENDER = "automatic";
