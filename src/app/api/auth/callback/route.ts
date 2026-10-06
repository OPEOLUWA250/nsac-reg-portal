import { NextRequest, NextResponse } from "next/server";
import { adminAuthClient } from "@/lib/server/admin-auth";
import { safeAdminNext } from "@/lib/safe-next";
import { adminActivityCookie } from "@/lib/server/admin-idle";

export const runtime = "nodejs";

// GET /api/auth/callback?code=...&next=/admin/...
// Where the password-reset email's link lands: swaps the one-time code for
// a session, then goes on to a safe /admin page.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safeAdminNext(url.searchParams.get("next"));
  const failed = NextResponse.redirect(new URL("/admin/login?error=link", url.origin));
  if (!code) return failed;
  try {
    const client = await adminAuthClient();
    if (!client) return failed;
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      console.warn(`Auth link failed: ${error.message}`);
      return failed;
    }
    // A fresh sign-in: start the inactivity clock (src/lib/server/admin-idle.ts).
    const response = NextResponse.redirect(new URL(next, url.origin));
    response.cookies.set(adminActivityCookie(Date.now()));
    return response;
  } catch (err) {
    console.warn(`Auth link failed: ${err instanceof Error ? err.message : String(err)}`);
    return failed;
  }
}
