import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { ADMIN_COOKIE_OPTIONS, resolveAdminRole, supabaseAuthConfig } from "@/lib/server/admin-roles";
import {
  ADMIN_ACTIVITY_COOKIE,
  adminActivityCookie,
  adminActivityExpired,
  parseAdminActivity,
} from "@/lib/server/admin-idle";

// Protects admin and scanner pages. API routes check sign-in themselves
// (adminRoute in src/lib/server/admin-auth.ts).
//   - not an admin           -> /admin/login?next=<where they were going>
//   - inactive too long      -> signed out, then as above (src/lib/server/admin-idle.ts)
//   - temporary password     -> /admin/reset-password
//   - already signed in, on /admin/login -> /admin
// It also refreshes the Supabase session cookies on every admin page load,
// and counts the page load as activity.

const LOGIN = "/admin/login";
const RESET = "/admin/reset-password";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = supabaseAuthConfig();
  let user: User | null = null;
  let supabase: ReturnType<typeof createServerClient> | null = null;

  if (config) {
    try {
      supabase = createServerClient(config.url, config.anonKey, {
        cookieOptions: ADMIN_COOKIE_OPTIONS,
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(list) {
            for (const { name, value } of list) request.cookies.set(name, value);
            response = NextResponse.next({ request });
            for (const { name, value, options } of list) response.cookies.set(name, value, options);
          },
        },
      });
      user = (await supabase.auth.getUser()).data.user;
    } catch {
      user = null; // auth unreachable: treat as signed out
    }
  }

  let role = await resolveAdminRole(user);
  const { pathname, search } = request.nextUrl;

  if (role) {
    const activity = parseAdminActivity(request.cookies.get(ADMIN_ACTIVITY_COOKIE)?.value);
    if (adminActivityExpired(activity)) {
      // "local": only this browser's session; the admin stays signed in elsewhere.
      await supabase?.auth.signOut({ scope: "local" }).catch(() => undefined);
      // If Supabase couldn't be reached, its session cookies are still here.
      for (const { name } of request.cookies.getAll()) {
        if (name.startsWith("sb-")) response.cookies.delete(name);
      }
      response.cookies.delete(ADMIN_ACTIVITY_COOKIE);
      role = null; // from here on, the same as signed out
    } else if (activity && !isPrefetch(request)) {
      response.cookies.set(adminActivityCookie(activity.signedInAt));
    }
  }

  // Redirects keep any refreshed session cookies.
  const redirect = (to: string) => {
    const res = NextResponse.redirect(new URL(to, request.url));
    for (const cookie of response.cookies.getAll()) res.cookies.set(cookie);
    return res;
  };

  if (!role) {
    if (pathname === LOGIN) return response;
    return redirect(`${LOGIN}?next=${encodeURIComponent(pathname + search)}`);
  }
  if (user?.app_metadata?.must_change_password === true && pathname !== RESET) return redirect(RESET);
  if (pathname === LOGIN) return redirect("/admin");
  return response;
}

// Next.js fetching a linked page ahead of time isn't the admin doing anything.
function isPrefetch(request: NextRequest): boolean {
  return request.headers.get("next-router-prefetch") === "1" || request.headers.get("purpose") === "prefetch";
}

export const config = {
  matcher: ["/admin/:path*", "/checkin/:path*"],
};
