// Who gets the "new registration" email (src/lib/admin-registration-email.ts).
// The list is edited in /admin → Settings and saved in the settings table;
// the ADMIN_NOTIFY_EMAILS server setting adds to it. Recipients don't need
// an admin account. Shared by the Settings page (browser) and the server.

export const MAX_ALERT_EMAILS = 20;

// Same rule as the registration form's email field.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL_LENGTH = 254;

function normalize(value: string): string {
  return value.trim().replace(/^["'`<]+|["'`>]+$/g, "").toLowerCase();
}

export function isAlertEmail(value: string): boolean {
  return value.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(value);
}

/**
 * The Settings box: addresses one per line (commas and semicolons work too).
 * Returns the valid ones, lower-cased and without repeats, and what wasn't
 * an email address as typed.
 */
export function parseAlertEmailList(raw: string): { emails: string[]; invalid: string[] } {
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const email = normalize(part);
    if (!email) continue;
    if (!isAlertEmail(email)) invalid.push(part.trim());
    else if (!emails.includes(email)) emails.push(email);
  }
  return { emails, invalid };
}

/**
 * A list from a request or the database: every entry must be an email
 * address, at most MAX_ALERT_EMAILS of them. null when it isn't.
 */
export function cleanAlertEmails(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) return null;
  const { emails, invalid } = parseAlertEmailList(value.join("\n"));
  if (invalid.length > 0 || emails.length > MAX_ALERT_EMAILS) return null;
  return emails;
}

/** Everyone to email, from several lists, without repeats. */
export function mergeAlertRecipients(...lists: readonly string[][]): string[] {
  return [...new Set(lists.flat().map(normalize).filter(isAlertEmail))];
}
