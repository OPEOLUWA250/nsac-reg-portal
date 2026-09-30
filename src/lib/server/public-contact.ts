import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hasValidTicket, type Attendee } from "@/lib/types";

type Contact = Pick<Attendee, "full_name" | "first_name" | "last_name" | "email" | "phone" | "organization" | "job_title" | "nationality" | "role">;
type PublicContact = { status: "invalid" } | { status: "private" } | { status: "shared"; contact: Contact };

/** Only explicitly consenting, valid ticket holders expose public contact fields. */
export async function getPublicContact(code: string): Promise<PublicContact> {
  if (!/^[A-Za-z0-9]{8,64}$/.test(code)) return { status: "invalid" };
  const { data, error } = await supabaseAdmin().from("attendees")
    .select("full_name, first_name, last_name, email, phone, organization, job_title, nationality, role, share_details, payment_status")
    .eq("unique_code", code).maybeSingle();
  if (error || !data || !hasValidTicket(data)) return { status: "invalid" };
  if (data.share_details !== true) return { status: "private" };
  const { full_name, first_name, last_name, email, phone, organization, job_title, nationality, role } = data;
  return { status: "shared", contact: { full_name, first_name, last_name, email, phone, organization, job_title, nationality, role } };
}
