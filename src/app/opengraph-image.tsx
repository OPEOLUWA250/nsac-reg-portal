import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { brandFonts, logoDataUrl } from "@/lib/ticket-image";
import { EVENT_INFO } from "@/lib/event-info";

// Link preview shown when any page of the site is shared on LinkedIn,
// WhatsApp, X, Slack… (Open Graph image). Built once at build time.

export const alt = `${EVENT_INFO.name.en} — ${EVENT_INFO.date.en}, ${EVENT_INFO.place.en}. Register now.`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const [fonts, logo, mark] = await Promise.all([
    brandFonts(),
    logoDataUrl(),
    readFile(join(process.cwd(), "public", "brand", "mark.png")).then(
      (b) => `data:image/png;base64,${b.toString("base64")}`,
      () => null
    ),
  ]);
  const display = fonts.length ? "Space Grotesk" : undefined;
  const body = fonts.length ? "Inter" : undefined;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          fontFamily: body,
          backgroundImage: "linear-gradient(135deg, #040B1E 0%, #0A1A31 45%, #03416A 100%)",
        }}
      >
        {/* Planet horizon glow */}
        <div
          style={{
            position: "absolute",
            left: -300,
            top: 470,
            width: 1800,
            height: 1800,
            borderRadius: 9999,
            background: "#061A36",
            boxShadow: "0 0 90px 20px rgba(92,184,255,0.55)",
            border: "3px solid rgba(170,220,255,0.85)",
            display: "flex",
          }}
        />
        {/* Orbits + Africa mark, right */}
        <div style={{ position: "absolute", right: 70, top: 70, width: 400, height: 400, borderRadius: 9999, border: "2px solid rgba(255,255,255,0.18)", display: "flex" }} />
        <div style={{ position: "absolute", right: 120, top: 120, width: 300, height: 300, borderRadius: 9999, border: "2px solid rgba(247,193,92,0.45)", display: "flex" }} />
        <div style={{ position: "absolute", right: 150, top: 125, width: 22, height: 22, borderRadius: 9999, background: "#F09F07", display: "flex" }} />
        {mark && (
          // eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by ImageResponse
          <img src={mark} alt="" width={220} height={220} style={{ position: "absolute", right: 160, top: 160, width: 220, height: 220 }} />
        )}

        {/* Text, left */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", padding: "64px 72px", width: 720 }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by ImageResponse
            <img src={logo} alt="" width={260} height={96} style={{ width: 260, height: 96 }} />
          ) : (
            <div style={{ fontFamily: display, fontWeight: 700, fontSize: 40, color: "#FFFFFF" }}>NewSpace Africa</div>
          )}
          <div style={{ marginTop: 44, fontSize: 22, fontWeight: 600, letterSpacing: 5, textTransform: "uppercase", color: "#F7C15C" }}>
            Registration is open
          </div>
          <div style={{ marginTop: 14, fontFamily: display, fontWeight: 700, fontSize: 64, lineHeight: 1.05, color: "#FFFFFF" }}>
            NewSpace Africa Conference 2027
          </div>
          <div style={{ marginTop: 22, fontSize: 30, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>
            {`${EVENT_INFO.date.en} · ${EVENT_INFO.place.en}`}
          </div>
          <div
            style={{
              marginTop: 34,
              alignSelf: "flex-start",
              display: "flex",
              padding: "16px 34px",
              borderRadius: 9999,
              background: "#F09F07",
              color: "#0A1A31",
              fontSize: 26,
              fontWeight: 600,
            }}
          >
            Register now →
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined }
  );
}
