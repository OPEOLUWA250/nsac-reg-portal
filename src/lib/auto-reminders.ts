import { AUTO_REMINDER_DAYS } from "@/lib/payment-reminder";

// The automatic payment reminder setting (/admin → Settings). Once a day,
// people still awaiting payment `afterDays` after registering get one
// reminder, in their language, unless anyone has reminded them already.
// Safe to import from the browser.

export interface AutoReminders {
  enabled: boolean;
  afterDays: number;
  /** Where replies go; the sending address when empty. */
  replyTo: string | null;
}

export const DEFAULT_AUTO_REMINDERS: AutoReminders = { enabled: false, afterDays: AUTO_REMINDER_DAYS.default, replyTo: null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The setting as stored or sent from the page, or null when it isn't valid. */
export function cleanAutoReminders(raw: unknown): AutoReminders | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const days = Number(r.afterDays);
  const replyTo = typeof r.replyTo === "string" ? r.replyTo.trim() : "";
  if (typeof r.enabled !== "boolean") return null;
  if (!Number.isInteger(days) || days < AUTO_REMINDER_DAYS.min || days > AUTO_REMINDER_DAYS.max) return null;
  if (replyTo && (!EMAIL_RE.test(replyTo) || replyTo.length > 254)) return null;
  return { enabled: r.enabled, afterDays: days, replyTo: replyTo || null };
}
