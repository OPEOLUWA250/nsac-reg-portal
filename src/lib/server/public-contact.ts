import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hasValidTicket, type Attendee } from "@/lib/types";

type Contact = Pick<Attendee, "full_name" | "first_name" | "last_name" | "email" | "phone" | "organization" | "job_title" | "role">;
type PublicContact = { status: "invalid" } | { status: "private"; contact: Pick<Contact, "full_name" | "organization" | "job_title"> } | { status: "shared"; contact: Contact };

/** Only explicitly consenting, valid ticket holders expose public contact fields. */
export async function getPublicContact(code: string): Promise<PublicContact> {
  if (!/^[A-Za-z0-9]{8,64}$/.test(code)) return { status: "invalid" };
  const { data, error } = await supabaseAdmin().from("attendees")
    .select("full_name, first_name, last_name, email, phone, organization, job_title, role, share_details, payment_status")
    .eq("unique_code", code).maybeSingle();
  if (error || !data || !hasValidTicket(data)) return { status: "invalid" };
  if (data.share_details !== true) return { status: "private", contact: { full_name: data.full_name, organization: data.organization, job_title: data.job_title } };
  const { full_name, first_name, last_name, email, phone, organization, job_title, role } = data;
  return { status: "shared", contact: { full_name, first_name, last_name, email, phone, organization, job_title, role } };
}
