import { NextRequest, NextResponse } from "next/server";
import { getPublicContact } from "@/lib/server/public-contact";

export const runtime = "nodejs";

// GET /p/<code>/vcard: the attendee's contact card (.vcf), for "Save
// contact" on their contact page. Only when they agreed to share.

function esc(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/p/[code]/vcard">) {
  const { code } = await ctx.params;
  const result = await getPublicContact(code);
  if (result.status !== "shared") return NextResponse.json({ error: "not found" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const a = result.contact;

  const [first = "", ...rest] = a.full_name.trim().split(/\s+/);
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${esc(a.last_name ?? rest.join(" "))};${esc(a.first_name ?? first)};;;`,
    `FN:${esc(a.full_name)}`,
    a.organization ? `ORG:${esc(a.organization)}` : "",
    a.job_title ? `TITLE:${esc(a.job_title)}` : "",
    a.residence_country ? `ADR;TYPE=WORK:;;;;;;${esc(a.residence_country)}` : "",
    `CATEGORIES:${esc(a.role)}`,
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
