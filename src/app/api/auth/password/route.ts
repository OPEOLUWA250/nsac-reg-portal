import { NextRequest, NextResponse } from "next/server";
import { adminAuthClient, getAdminSession } from "@/lib/server/admin-auth";
import { passwordProblem } from "@/lib/admin-password";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// POST /api/auth/password { password }
// Sets a new password for the signed-in admin. The one admin route allowed
// while a temporary password is still in use (that's how it gets replaced).
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) ?? {};
  const password = typeof body.password === "string" ? body.password : "";
  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const client = await adminAuthClient();
  if (!client) return NextResponse.json({ error: "Sign-in isn't available right now." }, { status: 503 });
  const { error } = await client.auth.updateUser({ password });
  if (error) {
    console.warn(`Password change failed for ${session.email}: ${error.message}`);
    const samePassword = /different from the old password/i.test(error.message);
    return NextResponse.json(
      { error: samePassword ? "Choose a password different from the old one." : "Couldn't change the password. Try again." },
      { status: 400 }
    );
  }

  if (session.mustChangePassword) {
    const { error: flagError } = await supabaseAdmin().auth.admin.updateUserById(session.user.id, {
      app_metadata: { must_change_password: false },
    });
    if (flagError) {
      console.error(`Couldn't clear must_change_password for ${session.email}: ${flagError.message}`);
      return NextResponse.json({ error: "Password saved, but something went wrong. Try once more." }, { status: 500 });
    }
    // The session token still carries the old flag until it refreshes.
    await client.auth.refreshSession().catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
