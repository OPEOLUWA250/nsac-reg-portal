import { NextRequest } from "next/server";

// Minimal shared-secret gate for the check-in desk. Good enough for a single
// event staffed by a small team sharing one code. If you need per-staff
// accounts/audit trails later, swap this for Supabase Auth.
export function isStaffAuthorized(req: NextRequest): boolean {
  const expected = process.env.STAFF_ACCESS_CODE;
  if (!expected) return true; // no code configured -> auth disabled
  const provided = req.headers.get("x-staff-code");
  return provided === expected;
}
