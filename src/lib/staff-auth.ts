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

// Changing prices is more sensitive than scanning badges, and the staff code
// is shared with every check-in volunteer. If ADMIN_ACCESS_CODE is set,
// those actions also need it (sent as x-admin-code).
export function adminCodeRequired(): boolean {
  return Boolean(process.env.ADMIN_ACCESS_CODE);
}

export function isAdminAuthorized(req: NextRequest): boolean {
  if (!isStaffAuthorized(req)) return false;
  const expected = process.env.ADMIN_ACCESS_CODE;
  if (!expected) return true;
  return req.headers.get("x-admin-code") === expected;
}
