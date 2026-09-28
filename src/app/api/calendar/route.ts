import { NextRequest } from "next/server";
import { buildIcs, icsFilename } from "@/lib/calendar";

// GET /api/calendar[?lang=fr] — the conference as an .ics calendar file
// ("Add to calendar" → Apple Calendar / Outlook).
export function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang") === "fr" ? "fr" : "en";
  return new Response(buildIcs(lang), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFilename()}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
