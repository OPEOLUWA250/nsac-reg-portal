import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hasValidTicket, type Attendee } from "@/lib/types";

type Contact = Pick<Attendee, "full_name" | "first_name" | "last_name" | "email" | "phone" | "organization" | "job_title" | "role">;
type PublicContact = { status: "invalid" } | { status: "private"; contact: Pick<Contact, "full_name" | "organization" | "job_title"> } | { status: "shared"; contact: Contact };

const FIELDS = "full_name, first_name, last_name, email, phone, organization, job_title, role, share_details, payment_status";

/**
 * Only explicitly consenting, valid ticket holders expose public contact fields.
 * `code` is either the badge's contact_code or the ticket's unique_code (a
 * phone camera scanning someone's emailed ticket lands here too).
 */
export async function getPublicContact(code: string): Promise<PublicContact> {
  if (!/^[A-Za-z0-9]{8,64}$/.test(code)) return { status: "invalid" };
  const find = (column: "contact_code" | "unique_code") =>
    supabaseAdmin().from("attendees").select(FIELDS).eq(column, code).maybeSingle();
  let { data, error } = await find("unique_code");
  if (!error && !data) ({ data, error } = await find("contact_code"));
  if (error || !data || !hasValidTicket(data)) return { status: "invalid" };
  if (data.share_details !== true) return { status: "private", contact: { full_name: data.full_name, organization: data.organization, job_title: data.job_title } };
  const { full_name, first_name, last_name, email, phone, organization, job_title, role } = data;
  return { status: "shared", contact: { full_name, first_name, last_name, email, phone, organization, job_title, role } };
}
