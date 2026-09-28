// Must match the attendees_role_check constraint in the database
// (supabase/migrations/20260928140000_attendee_roles.sql).
export const ATTENDEE_ROLES = [
  "attendee",
  "delegate",
  "speaker",
  "host",
  "staff",
  "sponsor",
  "press",
] as const;
export type AttendeeRole = (typeof ATTENDEE_ROLES)[number];

export function isAttendeeRole(value: string): value is AttendeeRole {
  return (ATTENDEE_ROLES as readonly string[]).includes(value);
}

/** null = legacy Jotform registration (Jotform collected the payment). */
export type PaymentStatus = "pending" | "paid" | "not_required" | null;

export interface Attendee {
  id: string;
  jotform_submission_id: string | null;
  jotform_form_id: string | null;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: AttendeeRole | string;
  organization: string | null;
  phone: string | null;
  job_title: string | null;
  nationality: string | null;
  residence_country: string | null;
  organization_country: string | null;
  professional_category: string | null;
  job_function: string | null;
  needs_invitation_letter: boolean | null;
  passport_path: string | null;
  food_allergies: string | null;
  opt_in_organizer: boolean | null;
  opt_in_sponsors: boolean | null;
  vat_number: string | null;
  invoice_reference: string | null;
  /** How they registered: "web" (our form), "walk_in" (admin) or "jotform". */
  source: string | null;
  /** "en" or "fr" — language of emails. */
  language: string | null;
  consent_at: string | null;
  ticket_type: string | null;
  amount_cents: number | null;
  currency: string | null;
  payment_status: PaymentStatus;
  stripe_session_id: string | null;
  paid_at: string | null;
  unique_code: string;
  checked_in: boolean;
  checked_in_at: string | null;
  checked_in_station: string | null;
  badge_printed_at: string | null;
  badge_print_count: number;
  qr_email_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Can this attendee enter / receive their QR ticket? */
export function hasValidTicket(a: Pick<Attendee, "payment_status">): boolean {
  return a.payment_status !== "pending";
}
