import { NextRequest } from "next/server";

// The check-in scanner (/checkin and /api/checkin, /api/staff) is protected by
// one shared staff code, so volunteers don't need admin accounts. The admin
// itself uses email + password sign-in: see src/lib/server/admin-auth.ts.
export function isStaffAuthorized(req: NextRequest): boolean {
  const expected = process.env.STAFF_ACCESS_CODE;
  if (!expected) return true; // no code configured -> auth disabled
  const provided = req.headers.get("x-staff-code");
  return provided === expected;
}
