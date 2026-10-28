import { ImageResponse } from "next/og";
import { brandFonts, logoDataUrl } from "@/lib/ticket-image";
import { EVENT_INFO } from "@/lib/event-info";
import { compressedPngResponse } from "@/lib/png";
import { AC_UNITS, BOOTHS, FACILITIES, MAP_H, MAP_W, TABLES, ZONES } from "@/lib/venue/data";
import { wallsOf } from "@/lib/venue/pathfinding";

// Link preview for /venue: the floor plan, drawn from the same data as the
// map, so it can't go out of date. Built once at build time.

export const alt = `Venue map of ${EVENT_INFO.name.en}, ${EVENT_INFO.place.en}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BOOTH = { s: "#2f7d3a", l: "#2f6fb8", x: "#03416a" } as const;

function planSvg(): string {
  const r = ([x, y, w, h]: number[], attrs: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${attrs}/>`;
  const parts = [
    ...ZONES.map((z) => r(z.rect, `fill="${z.fill === "hall" ? "#eef2f5" : "#fbf8f1"}"`)),
    ...AC_UNITS.map((a) => r(a, `fill="#e3e7eb" stroke="#9aa5b1" stroke-width=".15"`)),
    ...TABLES.map((t) => r(t, `rx=".7" fill="#ffffff" stroke="#b98e5f" stroke-width=".18"`)),
    ...FACILITIES.flatMap((f) => (f.rect ? [r(f.rect, `fill="#ffffff" stroke="#03416a" stroke-width=".2"`)] : [])),
    ...ZONES.flatMap((z) => wallsOf(z.rect, z.doors)).map((w) => r(w, `fill="#03416a"`)),
    ...BOOTHS.map(({ rect: [x, y, w, h], size }) => r([x + 0.1, y + 0.1, w - 0.2, h - 0.2], `rx=".45" fill="${BOOTH[size]}"`)),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${MAP_W + 2} ${MAP_H + 2}">${parts.join("")}</svg>`;
}

export default async function VenueOpengraphImage() {
  const [fonts, logo] = await Promise.all([brandFonts(), logoDataUrl()]);
  const display = fonts.length ? "Raleway" : undefined;
  const body = fonts.length ? "DM Sans" : undefined;
  const plan = `data:image/svg+xml;base64,${Buffer.from(planSvg()).toString("base64")}`;
  const planW = 800; // the whole plan fits under the title
  const planH = Math.round((planW * (MAP_H + 2)) / (MAP_W + 2));

  const image = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", fontFamily: body, background: "#03416A", padding: "40px 60px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: "#F09F07" }}>
              {`Venue map · ${EVENT_INFO.place.en}`}
            </div>
            <div style={{ marginTop: 8, fontFamily: display, fontWeight: 800, fontSize: 50, lineHeight: 1.05, color: "#FFFFFF" }}>
              Find your way around the venue
            </div>
          </div>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by ImageResponse
            <img src={logo} alt="" width={190} height={70} style={{ width: 190, height: 70 }} />
          )}
        </div>
        <div style={{ marginTop: 26, display: "flex", justifyContent: "center", background: "#E4E8EC", borderRadius: "12px 12px 0 0", padding: "16px 0 0" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by ImageResponse */}
          <img src={plan} alt="" width={planW} height={planH} style={{ width: planW, height: planH }} />
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined }
  );
  return compressedPngResponse(image);
}
