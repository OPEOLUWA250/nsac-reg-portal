// The admin activity log: who did what in the admin, and when. Written by the
// server (src/lib/server/activity-log.ts) as actions happen; read by super
// admins on /admin/activity.

export const ACTIVITY_AREAS = [
  "sign_in",
  "registrations",
  "check_in",
  "tickets",
  "promo_codes",
  "student_codes",
  "booths",
  "letters",
  "admins",
  "settings",
] as const;

export type ActivityArea = (typeof ACTIVITY_AREAS)[number];

export const AREA_LABEL: Record<ActivityArea, string> = {
  sign_in: "Sign-in",
  registrations: "Registrations",
  check_in: "Check-in",
  tickets: "Tickets",
  promo_codes: "Promo codes",
  student_codes: "Student codes",
  booths: "Booths",
  letters: "Invitation letters",
  admins: "Admins",
  settings: "Settings",
};

export function isActivityArea(v: unknown): v is ActivityArea {
  return typeof v === "string" && (ACTIVITY_AREAS as readonly string[]).includes(v);
}

/** One entry, as the page receives it. */
export interface ActivityEntry {
  id: number;
  at: string;
  /** Who did it; null for something the system did on its own. */
  actorEmail: string | null;
  area: ActivityArea;
  /** Machine name, e.g. "attendee.role_changed". */
  action: string;
  /** The sentence shown, without the actor: "changed Ada Obi's category from Delegate to VIP". */
  summary: string;
  targetType: string | null;
  targetId: string | null;
  /** Extra facts worth keeping (old and new values, counts). */
  details: Record<string, unknown> | null;
}

/** Entries per page on /admin/activity. */
export const ACTIVITY_PAGE = 50;
