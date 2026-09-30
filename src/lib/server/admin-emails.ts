// Owners (super admins) come from the ADMIN_EMAILS environment variable, not
// the database, so they can never be locked out from inside the dashboard.
// No Next.js request APIs here: the proxy and route handlers both use this.

export type AdminEmailLookup = (email: string) => Promise<boolean>;

/** "a@x.com, B@Y.com;'c@z.com'" -> ["a@x.com", "b@y.com", "c@z.com"]. Empty = no owners. */
export function parseAdminEmails(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,;]+/)
    .map((e) => e.trim().replace(/^["'`]+|["'`]+$/g, "").toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

export function ownerEmails(): string[] {
  return parseAdminEmails(process.env.ADMIN_EMAILS);
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ownerEmails().includes(email.trim().toLowerCase());
}

// Default lookup: is there an admin_users row with this email? Loaded lazily
// so tests (and the proxy) only pull in the database client when needed.
async function adminUserExists(email: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  const { data, error } = await supabaseAdmin().from("admin_users").select("id").eq("email", email).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/**
 * Before signing in: may this email be an admin at all? Owners, or someone in
 * admin_users. Used by the login and forgot-password routes. Fails closed.
 */
export async function isAllowedAdminEmail(email: string, lookup: AdminEmailLookup = adminUserExists): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  if (isOwnerEmail(normalized)) return true;
  try {
    return await lookup(normalized);
  } catch (err) {
    console.warn(`Admin email check failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
