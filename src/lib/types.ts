export type AttendeeRole =
  | "speaker"
  | "delegate"
  | "host"
  | "staff"
  | "sponsor";

export interface Attendee {
  id: string;
  jotform_submission_id: string | null;
  jotform_form_id: string | null;
  full_name: string;
  email: string;
  role: AttendeeRole | string;
  organization: string | null;
  phone: string | null;
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
