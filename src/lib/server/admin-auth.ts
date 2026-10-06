import "server-only";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { ADMIN_COOKIE_OPTIONS, resolveAdminRole, supabaseAuthConfig, type AdminRole } from "@/lib/server/admin-roles";
import { ADMIN_ACTIVITY_COOKIE, adminActivityCookie, adminActivityExpired, parseAdminActivity } from "@/lib/server/admin-idle";

// Admin sign-in for server code (route handlers, server components). The
// session lives in cookies, managed by @supabase/ssr. Pages are protected by
// src/proxy.ts; every admin API route is wrapped in adminRoute() below.
// Inactive sessions count as signed out (src/lib/server/admin-idle.ts).

export interface AdminSession {
  user: User;
  email: string;
  role: AdminRole;
  /** Signed in with a temporary password: must set a new one first. */
  mustChangePassword: boolean;
  /** When this session began (ms), for the inactivity cookie. */
  signedInAt: number;
}

/** Supabase client bound to this request's cookies, or null when not configured. */
export async function adminAuthClient() {
  const config = supabaseAuthConfig();
  if (!config) return null;
  const store = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookieOptions: ADMIN_COOKIE_OPTIONS,
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server components can't set cookies; the proxy refreshes them.
        }
      },
    },
  });
}

/** The signed-in admin, or null (signed out, not an admin, or auth unreachable). Never throws. */
export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    // Timed out: the next page load (src/proxy.ts) ends the Supabase session.
    const activity = parseAdminActivity((await cookies()).get(ADMIN_ACTIVITY_COOKIE)?.value);
    if (!activity || adminActivityExpired(activity)) return null;
    const client = await adminAuthClient();
    if (!client) return null;
    const { data } = await client.auth.getUser();
    const user = data.user;
    const role = await resolveAdminRole(user);
    if (!user || !role) return null;
    return {
      user,
      email: user.email!.toLowerCase(),
      role,
      mustChangePassword: user.app_metadata?.must_change_password === true,
      signedInAt: activity.signedInAt,
    };
  } catch (err) {
    console.warn(`Admin session check failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

type Handler<C> = (req: NextRequest, context: C, session: AdminSession) => Promise<Response> | Response;

/** Builds adminRoute around a session source (the real one below; a fake in tests). */
export function createAdminRoute(getSession: () => Promise<AdminSession | null>) {
  return function adminRoute<C>(handler: Handler<C>, options: { superAdmin?: boolean } = {}) {
    return async (req: NextRequest, context: C): Promise<Response> => {
      const session = await getSession();
      if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
      if (session.mustChangePassword) {
        return NextResponse.json({ error: "Set a new password before continuing." }, { status: 403 });
      }
      if (options.superAdmin && session.role !== "super_admin") {
        return NextResponse.json({ error: "Only super admins can do this." }, { status: 403 });
      }
      const response = await handler(req, context, session);
      // Reads include the dashboard's background polling: only actions count as activity.
      if (req.method === "GET" || req.method === "HEAD") return response;
      const res = response instanceof NextResponse ? response : new NextResponse(response.body, response);
      res.cookies.set(adminActivityCookie(session.signedInAt));
      return res;
    };
  };
}

/**
 * Wrap EVERY admin API route handler in this: 401 when signed out (or
 * inactive too long), 403 while a temporary password hasn't been replaced,
 * 403 when a super admin is required and this admin isn't one. Any request
 * but GET counts as activity.
 */
export const adminRoute = createAdminRoute(getAdminSession);
