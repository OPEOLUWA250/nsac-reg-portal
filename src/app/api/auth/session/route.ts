import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/server/admin-auth";

export const runtime = "nodejs";

// GET /api/auth/session -> { email, role, mustChangePassword } (for the profile menu)
export async function GET() {
  const session = await getAdminSession();
  const headers = { "Cache-Control": "private, no-store" };
  if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401, headers });
  return NextResponse.json(
    { email: session.email, role: session.role, mustChangePassword: session.mustChangePassword },
    { headers }
  );
}
