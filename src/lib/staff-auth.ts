import { NextRequest } from "next/server";

// TEMPORARY: the admin (/admin and /api/admin/*) has no sign-in while proper
// admin login is being built. Anyone with the address can open it. Set this
// back to true to require STAFF_ACCESS_CODE (and ADMIN_ACCESS_CODE, if set)
// again, and put StaffGate back in src/components/admin/AdminShell.tsx.
export const ADMIN_SIGN_IN_ENABLED = false;

// Minimal shared-secret gate for the check-in desk. Good enough for a single
// event staffed by a small team sharing one code. If you need per-staff
// accounts/audit trails later, swap this for Supabase Auth.
export function isStaffAuthorized(req: NextRequest): boolean {
  const expected = process.env.STAFF_ACCESS_CODE;
  if (!expected) return true; // no code configured -> auth disabled
  const provided = req.headers.get("x-staff-code");
  return provided === expected;
}

/** Admin pages' API routes: open while ADMIN_SIGN_IN_ENABLED is false. */
export function isAdminAreaAuthorized(req: NextRequest): boolean {
  return ADMIN_SIGN_IN_ENABLED ? isStaffAuthorized(req) : true;
}

// Changing prices is more sensitive than scanning badges, and the staff code
// is shared with every check-in volunteer. If ADMIN_ACCESS_CODE is set,
// those actions also need it (sent as x-admin-code).
export function adminCodeRequired(): boolean {
  return ADMIN_SIGN_IN_ENABLED && Boolean(process.env.ADMIN_ACCESS_CODE);
}

export function isAdminAuthorized(req: NextRequest): boolean {
  if (!ADMIN_SIGN_IN_ENABLED) return true;
  if (!isStaffAuthorized(req)) return false;
  const expected = process.env.ADMIN_ACCESS_CODE;
  if (!expected) return true;
  return req.headers.get("x-admin-code") === expected;
}
