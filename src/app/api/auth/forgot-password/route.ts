import { NextRequest, NextResponse } from "next/server";
import { adminAuthClient } from "@/lib/server/admin-auth";
import { isAllowedAdminEmail } from "@/lib/server/admin-emails";
import { clientIp, withinLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

// POST /api/auth/forgot-password { email }
// Always answers { sent: true }, whether or not the email is an admin, so
// it can't be used to find out who the admins are. The link only works in
// the same browser it was requested from (Supabase's PKCE flow).
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) ?? {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  try {
    // Past the limit nothing is sent (the answer stays the same), so nobody
    // can flood an admin's inbox with reset emails.
    const allowed =
      email &&
      email.length <= 254 &&
      (await withinLimit("reset-ip", clientIp(req), 5, 60 * 60)) &&
      (await withinLimit("reset-email", email, 3, 60 * 60));
    if (allowed && (await isAllowedAdminEmail(email))) {
      const client = await adminAuthClient();
      if (!client) throw new Error("sign-in not configured");
      const origin = new URL(req.url).origin;
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/api/auth/callback?next=/admin/reset-password`,
      });
      if (error) console.warn(`Password reset email failed for ${email}: ${error.message}`);
    }
  } catch (err) {
    console.warn(`Password reset failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return NextResponse.json({ sent: true });
}
