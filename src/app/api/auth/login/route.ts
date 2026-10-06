import { NextRequest, NextResponse } from "next/server";
import { adminAuthClient } from "@/lib/server/admin-auth";
import { isAllowedAdminEmail } from "@/lib/server/admin-emails";
import { resolveAdminRole } from "@/lib/server/admin-roles";
import { adminActivityCookie } from "@/lib/server/admin-idle";
import { ADMIN_PASSWORD_MAX } from "@/lib/admin-password";
import { clientIp, withinLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

// POST /api/auth/login { email, password }
// Every refusal gets the same answer, so the form can't reveal who the
// admins are. The real reason goes to the server log.
const REFUSED = { error: "Incorrect email or password." };
const TOO_MANY = { error: "Too many sign-in attempts. Wait 15 minutes and try again." };

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) ?? {};
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || email.length > 254 || !password || password.length > ADMIN_PASSWORD_MAX) {
      return NextResponse.json(REFUSED, { status: 401 });
    }

    // Stops password guessing: per visitor, and per email so spreading the
    // attempts over many machines doesn't help. Checked before anything else
    // about the email, and the same for every email, so it reveals nothing.
    const [ipOk, emailOk] = await Promise.all([
      withinLimit("login-ip", clientIp(req), 10, 15 * 60),
      withinLimit("login-email", email, 10, 15 * 60),
    ]);
    if (!ipOk || !emailOk) {
      console.warn(`Admin sign-in rate limited for ${email}`);
      return NextResponse.json(TOO_MANY, { status: 429 });
    }

    if (!(await isAllowedAdminEmail(email))) {
      console.warn(`Admin sign-in refused: ${email} is not an admin`);
      return NextResponse.json(REFUSED, { status: 401 });
    }

    const client = await adminAuthClient();
    if (!client) {
      console.warn("Admin sign-in unavailable: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing");
      return NextResponse.json(REFUSED, { status: 401 });
    }

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      console.warn(`Admin sign-in failed for ${email}: ${error?.message ?? "no user"}`);
      return NextResponse.json(REFUSED, { status: 401 });
    }

    const role = await resolveAdminRole(data.user);
    if (!role) {
      await client.auth.signOut();
      console.warn(`Admin sign-in refused for ${email}: signed in but not an admin (or email not confirmed)`);
      return NextResponse.json(REFUSED, { status: 401 });
    }

    const response = NextResponse.json({ ok: true, mustChangePassword: data.user.app_metadata?.must_change_password === true });
    response.cookies.set(adminActivityCookie(Date.now()));
    return response;
  } catch (err) {
    console.warn(`Admin sign-in failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json(REFUSED, { status: 401 });
  }
}
