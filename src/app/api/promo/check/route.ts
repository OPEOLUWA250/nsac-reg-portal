import { NextRequest, NextResponse } from "next/server";
import { checkPromoCode } from "@/lib/promo-codes";
import { PROMO_CODE_RE } from "@/lib/registration-fields";
import { describeError } from "@/lib/describe-error";

export const runtime = "nodejs";

// POST /api/promo/check { code, ticket }
// Used by the form's "Apply" button to show the discount before payment.
// The registration endpoint checks the code again, so this is only a preview.
//   200 { ok: true, code, percentOff }
//   200 { ok: false, error: "promo_unknown" | "promo_expired" | "promo_used_up" | "promo_not_for_ticket" | "promo_invalid" }
export async function POST(req: NextRequest) {
  let body: { code?: unknown; ticket?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "promo_invalid" }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const ticket = typeof body.ticket === "string" ? body.ticket : "";
  if (!PROMO_CODE_RE.test(code)) return NextResponse.json({ ok: false, error: "promo_invalid" });

  try {
    const check = await checkPromoCode(code, ticket);
    if (!check.ok) return NextResponse.json({ ok: false, error: `promo_${check.problem}` });
    return NextResponse.json({ ok: true, code: check.promo.code, percentOff: check.promo.percentOff });
  } catch (err) {
    console.error(`Promo check failed: ${describeError(err)}`);
    return NextResponse.json({ ok: false, error: "promo_unavailable" }, { status: 502 });
  }
}
