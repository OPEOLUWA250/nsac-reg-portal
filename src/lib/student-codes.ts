import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { describeError } from "@/lib/describe-error";

// Personal student codes. A student emails their student ID to
// info@spaceinafrica.com; an admin checks it and creates a code for that
// student's email in /admin/student-codes. The code unlocks the Student
// ticket on the form, only with that email address, and is used up once the
// payment succeeds (so a closed payment page doesn't waste it). Codes are
// kept in the Supabase `student_codes` table. Server-only.

export interface StudentCode {
  id: string;
  code: string;
  email: string;
  name: string;
  expiresAt: string;
  createdAt: string;
  createdBy: string | null;
  cancelledAt: string | null;
  usedAt: string | null;
  attendeeId: string | null;
  emailedAt: string | null;
  /** Language of the email to the student. */
  language: "en" | "fr";
}

interface Row {
  id: string;
  code: string;
  email: string;
  name: string;
  expires_at: string;
  created_at: string;
  created_by: string | null;
  cancelled_at: string | null;
  used_at: string | null;
  attendee_id: string | null;
  emailed_at: string | null;
  language: string | null;
}

const fromRow = (r: Row): StudentCode => ({
  id: r.id,
  code: r.code,
  email: r.email,
  name: r.name,
  expiresAt: r.expires_at,
  createdAt: r.created_at,
  createdBy: r.created_by,
  cancelledAt: r.cancelled_at,
  usedAt: r.used_at,
  attendeeId: r.attendee_id,
  emailedAt: r.emailed_at,
  language: r.language === "fr" ? "fr" : "en",
});

/** Table missing: the setup script hasn't been run in Supabase yet. */
export function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

// STU-7K3QXP: no 0/O or 1/I, so codes read out loud or copied by hand work.
function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "STU-" + Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join("");
}

export async function listStudentCodes(): Promise<StudentCode[]> {
  const { data, error } = await supabaseAdmin()
    .from("student_codes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}

export async function createStudentCode(input: {
  email: string;
  name: string;
  expiresAt: string;
  createdBy: string;
  language: "en" | "fr";
}): Promise<StudentCode> {
  // A fresh random code; on the (very unlikely) clash with an existing one, try another.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabaseAdmin()
      .from("student_codes")
      .insert({
        code: generateCode(),
        email: input.email.trim().toLowerCase(),
        name: input.name.trim(),
        expires_at: input.expiresAt,
        created_by: input.createdBy,
        language: input.language,
      })
      .select()
      .single();
    if (error?.code === "23505") continue;
    if (error) throw error;
    return fromRow(data as Row);
  }
  throw new Error("Couldn't generate a unique student code");
}

export async function cancelStudentCode(id: string): Promise<StudentCode | null> {
  const { data, error } = await supabaseAdmin()
    .from("student_codes")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .is("used_at", null)
    .is("cancelled_at", null)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : null;
}

export async function getStudentCode(id: string): Promise<StudentCode | null> {
  const { data, error } = await supabaseAdmin().from("student_codes").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : null;
}

export async function markStudentCodeEmailed(id: string): Promise<void> {
  const { error } = await supabaseAdmin().from("student_codes").update({ emailed_at: new Date().toISOString() }).eq("id", id);
  if (error) console.warn(`Couldn't record that student code ${id} was emailed: ${error.message}`);
}

export type StudentCodeProblem = "unknown" | "expired" | "used";

/**
 * Checks a code typed on the form against the registrant's email. A wrong
 * code and someone else's code get the same answer ("unknown"), so the form
 * can't be used to find out who has a code.
 */
export async function checkStudentCode(
  code: string,
  email: string,
  now: Date = new Date()
): Promise<{ ok: true; code: StudentCode } | { ok: false; problem: StudentCodeProblem }> {
  const { data, error } = await supabaseAdmin()
    .from("student_codes")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();
  if (error) throw error;
  const found = data ? fromRow(data as Row) : null;
  if (!found || found.cancelledAt || found.email !== email.trim().toLowerCase()) return { ok: false, problem: "unknown" };
  if (found.usedAt) return { ok: false, problem: "used" };
  if (new Date(found.expiresAt).getTime() < now.getTime()) return { ok: false, problem: "expired" };
  return { ok: true, code: found };
}

/** Records the code as used once the payment has gone through. Never throws: the registration is already paid. */
export async function markStudentCodeUsed(code: string, attendeeId: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin()
      .from("student_codes")
      .update({ used_at: new Date().toISOString(), attendee_id: attendeeId })
      .eq("code", code.trim().toUpperCase())
      .is("used_at", null);
    if (error) throw error;
  } catch (err) {
    console.error(`Couldn't mark student code ${code} as used by ${attendeeId}: ${describeError(err)}`);
  }
}
