import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateQrPngDataUrl } from "@/lib/qrcode";
import { listTickets } from "@/lib/ticket-store";
import { describeError } from "@/lib/describe-error";
import type { Attendee } from "@/lib/types";

// Branded, downloadable ticket (PNG): logo, attendee details and the check-in
// QR code. Used for the "Download" button on /register/success and attached
// to the confirmation email. Server-only.
//
// Logo: public/brand/logo.png is the all-white NewSpace Africa Conference
// logo from newspace.spaceinafrica.com (it sits on the blue header). If the
// file is missing, the "● NewSpace Africa" wordmark is drawn instead.
// Colours: the conference site's primary gold (#F09F07) and secondary blue
// (#03416A), with the portal's navy.

export const TICKET_SIZE = { width: 900, height: 1400 };

const NAVY = "#0A1A31";
const BRAND_BLUE = "#03416A";
const GOLD = "#F09F07";
const GOLD_LIGHT = "#F7C15C";
const OFFWHITE = "#FAFAF8";
const PAGE_BG = "#E9EDF3";

const COPY = {
  en: {
    pass: "2027 · Attendee pass",
    ticket: "Ticket",
    reference: "Reference",
    scan: "Show this code at the registration desk to collect your badge.",
  },
  fr: {
    pass: "2027 · Badge d'accès",
    ticket: "Billet",
    reference: "Référence",
    scan: "Présentez ce code à l'accueil pour récupérer votre badge.",
  },
} as const;

// ---------- fonts (brand fonts from Google Fonts, cached; default font if offline) ----------

type FontDef = { name: string; data: ArrayBuffer; weight: 400 | 600 | 700; style: "normal" };

async function loadGoogleFont(family: string, weight: number): Promise<ArrayBuffer> {
  const css = await (
    await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}`, {
      signal: AbortSignal.timeout(5000),
    })
  ).text();
  // Non-browser requests get TrueType; if several subsets come back, the
  // last one is "latin" (which includes accents such as é, ô).
  const urls = [...css.matchAll(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/g)].map((m) => m[1]);
  if (!urls.length) throw new Error(`No TTF found for ${family} ${weight}`);
  const res = await fetch(urls[urls.length - 1], { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Font download failed (${res.status})`);
  return res.arrayBuffer();
}

let fontsPromise: Promise<FontDef[]> | null = null;

function brandFonts(): Promise<FontDef[]> {
  fontsPromise ??= Promise.all([
    loadGoogleFont("Space Grotesk", 700).then((data) => ({ name: "Space Grotesk", data, weight: 700 as const, style: "normal" as const })),
    loadGoogleFont("Inter", 400).then((data) => ({ name: "Inter", data, weight: 400 as const, style: "normal" as const })),
    loadGoogleFont("Inter", 600).then((data) => ({ name: "Inter", data, weight: 600 as const, style: "normal" as const })),
  ]).catch((err) => {
    console.warn(`Ticket fonts unavailable, using default font: ${describeError(err)}`);
    fontsPromise = null; // try again next time
    return [];
  });
  return fontsPromise;
}

// ---------- logo ----------

const LOGO_FILES: [string, string][] = [
  ["logo.png", "image/png"],
  ["logo.svg", "image/svg+xml"],
  ["logo.jpg", "image/jpeg"],
];

/** The PNG logo for the email header, or null if there isn't one. */
export async function brandLogoPng(): Promise<Buffer | null> {
  try {
    return await readFile(join(process.cwd(), "public", "brand", "logo.png"));
  } catch {
    return null;
  }
}

async function logoDataUrl(): Promise<string | null> {
  for (const [file, mime] of LOGO_FILES) {
    try {
      const data = await readFile(join(process.cwd(), "public", "brand", file));
      return `data:${mime};base64,${data.toString("base64")}`;
    } catch {
      /* not there — try the next one */
    }
  }
  return null;
}

async function ticketName(attendee: Attendee, lang: "en" | "fr"): Promise<string | null> {
  if (!attendee.ticket_type) return null;
  try {
    const ticket = (await listTickets()).find((t) => t.id === attendee.ticket_type);
    if (ticket) return ticket.name[lang];
  } catch {
    /* fall back to the id */
  }
  return attendee.ticket_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------- rendering ----------

export async function renderTicket(
  attendee: Attendee,
  init: { headers?: Record<string, string> } = {}
): Promise<ImageResponse> {
  const lang = attendee.language === "fr" ? "fr" : "en";
  const t = COPY[lang];
  const [fonts, logo, qr, ticket] = await Promise.all([
    brandFonts(),
    logoDataUrl(),
    generateQrPngDataUrl(attendee.unique_code),
    ticketName(attendee, lang),
  ]);
  const display = fonts.length ? "Space Grotesk" : undefined;
  const body = fonts.length ? "Inter" : undefined;
  const name = attendee.full_name.trim();
  const reference = attendee.id.slice(0, 8).toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: 44,
          background: PAGE_BG,
          fontFamily: body,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: "#FFFFFF",
            borderRadius: 40,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              padding: "64px 64px 56px",
              background: `linear-gradient(135deg, ${NAVY} 0%, ${BRAND_BLUE} 100%)`,
              overflow: "hidden",
            }}
          >
            {/* orbit rings */}
            {/* orbit rings, kept inside the header (the renderer doesn't clip them) */}
            <div style={{ position: "absolute", top: 24, right: 36, width: 240, height: 240, borderRadius: 999, border: "2px solid rgba(247,193,92,0.30)", display: "flex" }} />
            <div style={{ position: "absolute", top: 69, right: 81, width: 150, height: 150, borderRadius: 999, border: "2px solid rgba(255,255,255,0.13)", display: "flex" }} />
            <div style={{ position: "absolute", top: 58, right: 88, width: 16, height: 16, borderRadius: 999, background: GOLD, display: "flex" }} />

            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by ImageResponse
              <img src={logo} alt="" width={300} height={111} style={{ width: 300, height: 111 }} />
            ) : (
              <div style={{ display: "flex", alignItems: "center" }}>
                <div style={{ width: 20, height: 20, borderRadius: 999, background: GOLD, marginRight: 18, display: "flex" }} />
                <div style={{ fontFamily: display, fontWeight: 700, fontSize: 50, color: "#FFFFFF", letterSpacing: 0.5 }}>
                  NewSpace Africa
                </div>
              </div>
            )}
            <div
              style={{
                marginTop: 30,
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: 5,
                textTransform: "uppercase",
                color: GOLD_LIGHT,
              }}
            >
              {t.pass}
            </div>
          </div>

          {/* Details */}
          <div style={{ display: "flex", flexDirection: "column", padding: "52px 64px 0" }}>
            <div
              style={{
                alignSelf: "flex-start",
                display: "flex",
                padding: "10px 24px",
                borderRadius: 999,
                background: "rgba(240,159,7,0.13)",
                border: "2px solid rgba(240,159,7,0.45)",
                color: NAVY,
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: 4,
                textTransform: "uppercase",
              }}
            >
              {attendee.role}
            </div>
            <div
              style={{
                marginTop: 26,
                fontFamily: display,
                fontWeight: 700,
                fontSize: name.length > 26 ? 50 : 62,
                lineHeight: 1.1,
                color: NAVY,
              }}
            >
              {name}
            </div>
            {attendee.organization && (
              <div style={{ marginTop: 14, fontSize: 30, color: "rgba(10,26,49,0.62)" }}>
                {attendee.organization}
              </div>
            )}
            <div style={{ display: "flex", marginTop: 34 }}>
              {ticket && (
                <div style={{ display: "flex", flexDirection: "column", marginRight: 64 }}>
                  <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: 3, textTransform: "uppercase", color: "rgba(10,26,49,0.45)" }}>
                    {t.ticket}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 28, fontWeight: 600, color: NAVY }}>{ticket}</div>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: 3, textTransform: "uppercase", color: "rgba(10,26,49,0.45)" }}>
                  {t.reference}
                </div>
                <div style={{ marginTop: 6, fontSize: 28, fontWeight: 600, color: NAVY, letterSpacing: 2 }}>{reference}</div>
              </div>
            </div>
          </div>

          {/* Perforation */}
          <div style={{ position: "relative", display: "flex", alignItems: "center", marginTop: 48, height: 48 }}>
            <div style={{ position: "absolute", left: -24, width: 48, height: 48, borderRadius: 999, background: PAGE_BG, display: "flex" }} />
            <div style={{ flex: 1, margin: "0 48px", borderTop: "3px dashed rgba(10,26,49,0.16)", display: "flex" }} />
            <div style={{ position: "absolute", right: -24, width: 48, height: 48, borderRadius: 999, background: PAGE_BG, display: "flex" }} />
          </div>

          {/* QR */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8px 64px 40px" }}>
            <div style={{ display: "flex", padding: 22, borderRadius: 28, background: OFFWHITE, border: "2px solid rgba(10,26,49,0.08)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by ImageResponse */}
              <img src={qr} alt="" width={380} height={380} style={{ width: 380, height: 380 }} />
            </div>
            <div style={{ marginTop: 26, maxWidth: 560, textAlign: "center", fontSize: 24, lineHeight: 1.4, color: "rgba(10,26,49,0.58)" }}>
              {t.scan}
            </div>
          </div>

          {/* Gold base */}
          <div style={{ height: 16, display: "flex", background: `linear-gradient(90deg, ${GOLD} 0%, ${GOLD_LIGHT} 100%)` }} />
        </div>
      </div>
    ),
    { ...TICKET_SIZE, fonts: fonts.length ? fonts : undefined, headers: init.headers }
  );
}

/** The ticket as PNG bytes (for email attachments). */
export async function renderTicketPng(attendee: Attendee): Promise<Buffer> {
  const res = await renderTicket(attendee);
  return Buffer.from(await res.arrayBuffer());
}

export function ticketFilename(): string {
  return "newspace-africa-2027-ticket.png";
}
