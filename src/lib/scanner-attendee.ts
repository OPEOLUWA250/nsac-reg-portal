import type { Attendee } from "@/lib/types";

export type ScannerAttendee = Pick<Attendee, "full_name" | "unique_code" | "checked_in" | "payment_status" | "share_details" | "role" | "email" | "phone" | "organization" | "job_title" | "nationality" | "residence_country">;

/** Explicit allowlist: scanner responses never include private registration data. */
export function scannerAttendee(attendee: Attendee): ScannerAttendee {
  const shared = attendee.share_details === true;
  return {
    full_name: attendee.full_name,
    unique_code: attendee.unique_code,
    checked_in: attendee.checked_in,
    payment_status: attendee.payment_status,
    share_details: shared,
    role: shared ? attendee.role : "",
    email: shared ? attendee.email : "",
    phone: shared ? attendee.phone : null,
    organization: attendee.organization,
    job_title: attendee.job_title,
    nationality: null,
    residence_country: null,
  };
}
