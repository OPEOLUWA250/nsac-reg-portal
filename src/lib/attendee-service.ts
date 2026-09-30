import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateUniqueCode, generateQrPngBuffer, ticketQrContent } from "@/lib/qrcode";
import { sendQrEmail, type EmailLanguage } from "@/lib/email";
import { hasValidTicket, type Attendee } from "@/lib/types";
import { brandLogoPng, renderTicketPng } from "@/lib/ticket-image";
import { publicBaseUrl } from "@/lib/public-url";
import { describeError } from "@/lib/describe-error";

// Single place that creates attendees, used by the public registration form,
// the admin walk-in form and the (legacy) Jotform webhook, so every path
// gets the same duplicate handling, email normalisation and QR email.

export type AttendeeSource = "web" | "walk_in" | "jotform";

export interface NewAttendeeInput {
  /** Optional client-generated UUID. Retrying with the same id never creates a second record. */
  id?: string;
  full_name: string;
  email: string;
  role: string;
  organization?: string | null;
  phone?: string | null;
  language?: EmailLanguage;
  source: AttendeeSource;
  jotform_submission_id?: string | null;
  jotform_form_id?: string | null;
  raw_payload?: unknown;
  /**
   * Extra attendee columns (job_title, nationality, ticket_type,
   * payment_status, …). Keys must be real columns — see the migration.
   */
  details?: Record<string, unknown>;
}

export type CreateAttendeeResult =
  /** A new record was created. */
  | { status: "created"; attendee: Attendee }
  /** Same id / Jotform submission seen before (a retry): the existing record. */
  | { status: "retry"; attendee: Attendee }
  /** Someone is already registered with this email. */
  | { status: "duplicate_email"; attendee: Attendee };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Escapes LIKE wildcards so an email containing "_" or "%" only matches itself.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

async function findByEmail(email: string): Promise<Attendee | null> {
  const supabase = supabaseAdmin();
  // Case-insensitive match, so rows saved before emails were lowercased
  // (e.g. "Ama@Example.com" from Jotform) still count as duplicates.
  const { data, error } = await supabase
    .from("attendees")
    .select("*")
    .ilike("email", escapeLike(email))
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Attendee | null;
}

async function findBy(column: "id" | "jotform_submission_id", value: string) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("attendees")
    .select("*")
    .eq(column, value)
    .maybeSingle();
  if (error) throw error;
  return data as Attendee | null;
}

export async function createAttendee(input: NewAttendeeInput): Promise<CreateAttendeeResult> {
  const email = normalizeEmail(input.email);

  // 1. Retries: the same client submission or the same Jotform submission.
  if (input.id) {
    const existing = await findBy("id", input.id);
    if (existing) return { status: "retry", attendee: existing };
  }
  if (input.jotform_submission_id) {
    const existing = await findBy("jotform_submission_id", input.jotform_submission_id);
    if (existing) return { status: "retry", attendee: existing };
  }

  // 2. One registration per email address.
  const byEmail = await findByEmail(email);
  if (byEmail) return { status: "duplicate_email", attendee: byEmail };

  // 3. Create. unique_code is only ever generated here, for a new row, so a
  //    retry can never replace a QR code that was already emailed.
  const supabase = supabaseAdmin();
  const row: Record<string, unknown> = {
    ...(input.details ?? {}),
    full_name: input.full_name.trim(),
    email,
    role: input.role,
    organization: input.organization ?? null,
    phone: input.phone ?? null,
    language: input.language ?? "en",
    source: input.source,
    unique_code: generateUniqueCode(),
    jotform_submission_id: input.jotform_submission_id ?? null,
    jotform_form_id: input.jotform_form_id ?? null,
    raw_payload: input.raw_payload ?? null,
  };
  if (input.id) row.id = input.id;

  const { data, error } = await supabase.from("attendees").insert(row).select().single();

  if (error) {
    // 23505 = unique violation: two requests raced. Resolve to whatever won.
    if (error.code === "23505") {
      if (input.id) {
        const existing = await findBy("id", input.id);
        if (existing) return { status: "retry", attendee: existing };
      }
      if (input.jotform_submission_id) {
        const existing = await findBy("jotform_submission_id", input.jotform_submission_id);
        if (existing) return { status: "retry", attendee: existing };
      }
      const existing = await findByEmail(email);
      if (existing) return { status: "duplicate_email", attendee: existing };
    }
    if (error.code === "42703") {
      console.error(
        "attendees table is missing a column — run supabase/migrations/20260928120000_registration_form.sql",
        error
      );
    }
    throw error;
  }

  return { status: "created", attendee: data as Attendee };
}

/**
 * Emails the attendee their QR code and records when it was sent.
 * Returns false (and logs) instead of throwing, so a registration is never
 * lost because the email provider had a problem — staff can use "Resend QR".
 */
export async function sendAttendeeQr(attendee: Attendee): Promise<boolean> {
  if (!hasValidTicket(attendee)) {
    // Never email an entry QR code for an unpaid registration.
    console.warn(`Not sending QR to attendee ${attendee.id}: payment pending`);
    return false;
  }
  try {
    const [qrPngBuffer, ticketPngBuffer, logoPngBuffer] = await Promise.all([
      generateQrPngBuffer(ticketQrContent(attendee.unique_code)),
      // The branded ticket is a nice extra: never let it block the email.
      renderTicketPng(attendee).catch((err) => {
        console.error(`Could not render ticket for attendee ${attendee.id}: ${describeError(err)}`);
        return null;
      }),
      brandLogoPng(),
    ]);
    await sendQrEmail({
      toEmail: attendee.email,
      fullName: attendee.full_name,
      role: attendee.role,
      language: attendee.language === "fr" ? "fr" : "en",
      qrPngBuffer,
      ticketPngBuffer,
      logoPngBuffer,
      flyerUrl: publicBaseUrl() ? `${publicBaseUrl()}/flyer` : null,
    });
    await supabaseAdmin()
      .from("attendees")
      .update({ qr_email_sent_at: new Date().toISOString() })
      .eq("id", attendee.id);
    return true;
  } catch (err) {
    console.error(`Failed to send QR email to attendee ${attendee.id}: ${describeError(err)}`);
    return false;
  }
}

/** Minutes to wait before re-sending a QR email to someone who registers twice. */
const RESEND_COOLDOWN_MINUTES = 10;

export function canResendQr(attendee: Attendee): boolean {
  if (!attendee.qr_email_sent_at) return true;
  const sentAt = new Date(attendee.qr_email_sent_at).getTime();
  return Date.now() - sentAt > RESEND_COOLDOWN_MINUTES * 60_000;
}
