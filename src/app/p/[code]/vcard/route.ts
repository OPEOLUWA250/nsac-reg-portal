import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hasValidTicket, type Attendee } from "@/lib/types";

export const runtime = "nodejs";

// GET /p/<code>/vcard: the attendee's contact card (.vcf), for "Save
// contact" on their contact page. Only when they agreed to share.

function esc(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/p/[code]/vcard">) {
  const { code } = await ctx.params;
  if (!/^[A-Za-z0-9]{8,64}$/.test(code)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data } = await supabaseAdmin()
    .from("attendees")
    .select("full_name, first_name, last_name, email, phone, organization, job_title, share_details, payment_status")
    .eq("unique_code", code)
    .maybeSingle();
  const a = data as Pick<
    Attendee,
    "full_name" | "first_name" | "last_name" | "email" | "phone" | "organization" | "job_title" | "share_details" | "payment_status"
  > | null;
  if (!a || !hasValidTicket(a) || !a.share_details) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [first = "", ...rest] = a.full_name.trim().split(/\s+/);
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${esc(a.last_name ?? rest.join(" "))};${esc(a.first_name ?? first)};;;`,
    `FN:${esc(a.full_name)}`,
    a.organization ? `ORG:${esc(a.organization)}` : "",
    a.job_title ? `TITLE:${esc(a.job_title)}` : "",
    `EMAIL;TYPE=INTERNET:${esc(a.email)}`,
    a.phone ? `TEL;TYPE=CELL:${esc(a.phone)}` : "",
    "NOTE:Met at the NewSpace Africa Conference 2027",
    "END:VCARD",
    "",
  ].filter((l, i, all) => l || i === all.length - 1);

  const filename = (a.full_name.replace(/[^\p{L}\p{N} -]/gu, "").trim() || "contact").replace(/\s+/g, "-");
  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.vcf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
