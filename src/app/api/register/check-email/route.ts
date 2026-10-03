import { NextRequest, NextResponse } from "next/server";
import { isEmailRegistered } from "@/lib/attendee-service";
import { describeError } from "@/lib/describe-error";
import { clientIp, withinLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// POST /api/register/check-email { email } -> { taken }
// Lets the form say "already registered" on step 1 instead of at payment.
// The registration endpoint enforces the same rule when the form is sent.
// Limited per visitor, so it can't be used to check a list of people's
// emails; past the limit the form skips this early check (429).
export async function POST(req: NextRequest) {
  if (!(await withinLimit("email-check", clientIp(req), 10, 10 * 60))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) return NextResponse.json({ taken: false });
  try {
    return NextResponse.json({ taken: await isEmailRegistered(email) });
  } catch (err) {
    console.error(`Email check failed: ${describeError(err)}`);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
