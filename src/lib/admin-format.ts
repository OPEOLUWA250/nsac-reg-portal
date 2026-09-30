import { COPY } from "@/lib/registration-copy";
import type { Attendee } from "@/lib/types";
import { roleLabel } from "@/lib/role-style";

// Display + CSV helpers for the admin dashboard (browser-safe).

const EN = COPY.en;

/** Walk-ins (registered by staff at the desk) show as "Walk-in". */
export function paymentLabel(status: Attendee["payment_status"], source?: string | null): string {
  if (source === "walk_in") return "Walk-in";
  if (status === "pending") return "Awaiting payment";
  if (status === "paid") return "Paid";
  if (status === "not_required") return "Not required";
  return "Jotform";
}

export function categoryLabel(code: string | null): string {
  if (!code) return "";
  return (EN.professionalCategories as Record<string, string>)[code] ?? code;
}

export function jobFunctionLabel(code: string | null): string {
  if (!code) return "";
  return (EN.jobFunctions as Record<string, string>)[code] ?? code;
}

export function money(cents: number | null, currency: string | null): string {
  if (cents == null) return "";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: (currency ?? "eur").toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** "28 Sep 2026, 21:43" in the admin's time zone. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "3 min ago", "yesterday", "12 Sep". */
export function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Spreadsheet-friendly local date: "2026-09-28 21:43". */
function csvDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

class PhoneValue {
  constructor(private readonly value: string) {}
  toString() {
    return this.value;
  }
}

const yesNo = (v: boolean | null) => (v == null ? "" : v ? "Yes" : "No");

/** Stripe dashboard link for a Checkout Session (test or live). */
export function stripeSessionUrl(sessionId: string | null): string | null {
  if (!sessionId) return null;
  const test = sessionId.startsWith("cs_test_") ? "/test" : "";
  return `https://dashboard.stripe.com${test}/checkout/sessions/${sessionId}`;
}

/** A phone number made only of digits, spaces and + ( ) . - */
const PHONE_RE = /^\+?[\d\s().-]{4,}$/;

// Quotes a CSV cell, and stops Excel from running cells that start with
// =, +, - or @ as formulas (a registrant could type one into the form).
function csvCell(value: unknown): string {
  let text = String(value ?? "");
  // Phone numbers: written as a text formula (="+234 …") so spreadsheets
  // keep the "+" and don't turn them into 2.34E+12. Safe: digits only.
  if (value instanceof PhoneValue) {
    return PHONE_RE.test(text) ? `"=""${text}"""` : csvCell(text);
  }
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const COLUMNS: [string, (a: Attendee, ticketName: (id: string | null) => string) => unknown][] = [
  ["Reference", (a) => a.id.slice(0, 8).toUpperCase()],
  ["First Name", (a) => a.first_name ?? a.full_name.split(" ")[0]],
  ["Last Name", (a) => a.last_name ?? a.full_name.split(" ").slice(1).join(" ")],
  ["Full Name", (a) => a.full_name],
  ["Email", (a) => a.email],
  ["Phone", (a) => (a.phone ? new PhoneValue(a.phone) : "")],
  ["Category", (a) => roleLabel(a.role)],
  ["Job Title", (a) => a.job_title],
  ["Organisation", (a) => a.organization],
  ["Organisation Country", (a) => a.organization_country],
  ["Professional Category", (a) => categoryLabel(a.professional_category)],
  ["Job Function", (a) => jobFunctionLabel(a.job_function)],
  ["Nationality", (a) => a.nationality],
  ["Country of Residence", (a) => a.residence_country],
  ["Needs Invitation Letter", (a) => yesNo(a.needs_invitation_letter)],
  ["Passport Uploaded", (a) => (a.passport_path ? "Yes" : "No")],
  ["Food Allergies", (a) => a.food_allergies],
  ["Ticket", (a, ticketName) => ticketName(a.ticket_type)],
  ["Amount", (a) => (a.amount_cents != null ? (a.amount_cents / 100).toFixed(2) : "")],
  ["Promo code", (a) => a.promo_code ?? ""],
  ["Currency", (a) => (a.currency ?? "").toUpperCase()],
  ["Payment Status", (a) => paymentLabel(a.payment_status, a.source)],
  ["Paid At", (a) => csvDate(a.paid_at)],
  ["VAT Number", (a) => a.vat_number],
  ["Invoice ID", (a) => a.invoice_reference],
  ["Stripe Session", (a) => a.stripe_session_id],
  ["Consent Given At", (a) => csvDate(a.consent_at)],
  ["Opt-in Organiser", (a) => yesNo(a.opt_in_organizer)],
  ["Opt-in Sponsors", (a) => yesNo(a.opt_in_sponsors)],
  ["Shares details on QR scan", (a) => yesNo(a.share_details)],
  ["Language", (a) => (a.language ?? "").toUpperCase()],
  ["Source", (a) => a.source],
  ["Registered At", (a) => csvDate(a.created_at)],
  ["QR Email Sent At", (a) => csvDate(a.qr_email_sent_at)],
  ["Checked In", (a) => yesNo(a.checked_in)],
  ["Checked In At", (a) => csvDate(a.checked_in_at)],
  ["Check-in Station", (a) => a.checked_in_station],
  ["Badge Prints", (a) => a.badge_print_count],
];

/** Every registration field, one row per attendee (UTF-8 with BOM for Excel). */
export function buildAttendeeCsv(attendees: Attendee[], ticketName: (id: string | null) => string): Blob {
  const rows = [
    COLUMNS.map(([header]) => header),
    ...attendees.map((a) => COLUMNS.map(([, get]) => get(a, ticketName))),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  // The BOM makes Excel read the file as UTF-8 (accents like "Côte d'Ivoire").
  return new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
}
