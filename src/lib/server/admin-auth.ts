import "server-only";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { resolveAdminRole, supabaseAuthConfig, type AdminRole } from "@/lib/server/admin-roles";

// Admin sign-in for server code (route handlers, server components). The
// session lives in cookies, managed by @supabase/ssr. Pages are protected by
// src/proxy.ts; every admin API route is wrapped in adminRoute() below.

export interface AdminSession {
  user: User;
  email: string;
  role: AdminRole;
  /** Signed in with a temporary password: must set a new one first. */
  mustChangePassword: boolean;
}

/** Supabase client bound to this request's cookies, or null when not configured. */
export async function adminAuthClient() {
  const config = supabaseAuthConfig();
  if (!config) return null;
  const store = await cookies();
  return createServerClient(config.url, config.anonKey, {
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
      return handler(req, context, session);
    };
  };
}

/**
 * Wrap EVERY admin API route handler in this: 401 when signed out, 403 while
 * a temporary password hasn't been replaced, 403 when a super admin is
 * required and this admin isn't one.
 */
export const adminRoute = createAdminRoute(getAdminSession);
