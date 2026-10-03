import type { User } from "@supabase/supabase-js";
import { isOwnerEmail } from "@/lib/server/admin-emails";

// Who is an admin, and what kind. No Next.js request APIs here: the proxy
// and route handlers both use this.
//   super_admin: an owner (ADMIN_EMAILS) or an admin_users row with that role
//   admin:       an admin_users row with role 'admin'
// Anything else (no user, unconfirmed email, no row, a database error) is
// not an admin: it fails closed.

export const ADMIN_ROLES = ["admin", "super_admin"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminUserLookup = (who: { id: string; email: string }) => Promise<{ role: string } | null>;

// admin_users row matching BOTH the auth user's id and email, so a row can't
// be reused by another account that later gets the same email.
async function adminUserRow(who: { id: string; email: string }): Promise<{ role: string } | null> {
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  const { data, error } = await supabaseAdmin()
    .from("admin_users")
    .select("role")
    .eq("id", who.id)
    .eq("email", who.email)
    .maybeSingle();
  if (error) throw error;
  return (data as { role: string } | null) ?? null;
}

type RoleUser = Pick<User, "id" | "email" | "email_confirmed_at">;

export async function resolveAdminRole(user: RoleUser | null | undefined, lookup: AdminUserLookup = adminUserRow): Promise<AdminRole | null> {
  if (!user || !user.email || !user.email_confirmed_at) return null;
  const email = user.email.trim().toLowerCase();
  if (isOwnerEmail(email)) return "super_admin";
  try {
    const row = await lookup({ id: user.id, email });
    return row && (ADMIN_ROLES as readonly string[]).includes(row.role) ? (row.role as AdminRole) : null;
  } catch (err) {
    console.warn(`Admin role lookup failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Admin session cookies. Sign-in only ever happens on the server (no browser
 * Supabase client), so page scripts never need them: HttpOnly keeps a stolen
 * script from reading the session, Secure keeps it off plain http.
 */
export const ADMIN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/** Supabase settings for signing admins in. Null when not configured (= everyone signed out). */
export function supabaseAuthConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}
