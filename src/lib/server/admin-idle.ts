// Signs admins out after a spell of inactivity, and after a maximum session
// length however active they are. A Supabase session never ends by itself
// (its refresh token keeps renewing it) and its own inactivity timeout is a
// paid-plan feature, so the portal keeps its own clock in a cookie:
//   "<signed in at>.<last active at>" (milliseconds)
// Activity = loading an admin page, an admin action (any request but GET), or
// using the page (AdminContext pings /api/auth/activity). The dashboard's
// background refreshes don't count, so an open, untouched tab still times out.
// The cookie isn't signed: it guards a forgotten, still-open browser, and
// anyone able to edit cookies there could use the session itself anyway.
// No Next.js request APIs here: the proxy and route handlers both use this.

export const ADMIN_IDLE_LIMIT_MS = 12 * 60 * 60 * 1000;
export const ADMIN_SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
export const ADMIN_ACTIVITY_COOKIE = "nsac_admin_activity";

export interface AdminActivity {
  signedInAt: number;
  lastActiveAt: number;
}

export function parseAdminActivity(value: string | undefined): AdminActivity | null {
  const match = /^(\d{1,15})\.(\d{1,15})$/.exec(value ?? "");
  return match ? { signedInAt: Number(match[1]), lastActiveAt: Number(match[2]) } : null;
}

/** True when the admin has to sign in again. No record (e.g. a session from before this existed) counts as expired. */
export function adminActivityExpired(activity: AdminActivity | null, now = Date.now()): boolean {
  if (!activity) return true;
  return now - activity.lastActiveAt > ADMIN_IDLE_LIMIT_MS || now - activity.signedInAt > ADMIN_SESSION_MAX_MS;
}

/** The cookie recording activity now, for a session that began at signedInAt. */
export function adminActivityCookie(signedInAt: number, now = Date.now()) {
  return {
    name: ADMIN_ACTIVITY_COOKIE,
    value: `${signedInAt}.${now}`,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.ceil(ADMIN_SESSION_MAX_MS / 1000),
  };
}
