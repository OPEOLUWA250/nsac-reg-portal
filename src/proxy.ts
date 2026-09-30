import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { resolveAdminRole, supabaseAuthConfig } from "@/lib/server/admin-roles";

// Protects the admin PAGES (/admin/*). API routes check sign-in themselves
// (adminRoute in src/lib/server/admin-auth.ts).
//   - not an admin           -> /admin/login?next=<where they were going>
//   - temporary password     -> /admin/reset-password
//   - already signed in, on /admin/login -> /admin
// It also refreshes the Supabase session cookies on every admin page load.

const LOGIN = "/admin/login";
const RESET = "/admin/reset-password";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = supabaseAuthConfig();
  let user: User | null = null;

  if (config) {
    try {
      const supabase = createServerClient(config.url, config.anonKey, {
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

  const role = await resolveAdminRole(user);
  const { pathname, search } = request.nextUrl;

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

export const config = {
  matcher: ["/admin/:path*"],
};
