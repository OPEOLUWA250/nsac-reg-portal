import type { Metadata } from "next";
import { Alert, ButtonLink, Eyebrow } from "@/components/ui";
import PrintButton from "@/components/venue/PrintButton";
import { generateQrSvgDataUrl } from "@/lib/qrcode";
import { publicBaseUrl, toHttps } from "@/lib/public-url";
import { QR_POINTS } from "@/lib/venue/data";

// Printable QR stickers for the venue (Q1 to Q6), two per A4 sheet. Each one
// opens the venue map with that spot as the starting point. Staff only:
// src/proxy.ts signs admins in for everything under /admin. It sits outside
// the admin shell so only the stickers print.

// Built per request, so the links use this deployment's PUBLIC_BASE_URL.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Venue QR stickers",
  robots: { index: false, follow: false },
};

const LIVE_SITE = "https://registration.newspace.spaceinafrica.com";

function siteUrl(): string {
  return publicBaseUrl() ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? toHttps(process.env.VERCEL_PROJECT_PRODUCTION_URL) : LIVE_SITE);
}

export default async function VenueStickersPage() {
  const base = siteUrl();
  const local = /^http:\/\/(localhost|127\.0\.0\.1)/.test(base);
  const stickers = await Promise.all(
    QR_POINTS.map(async (q) => {
      const url = `${base}/venue?from=${q.id}`;
      return { ...q, url, qr: await generateQrSvgDataUrl(url) };
    })
  );

  return (
    <main id="main" className="flex-1 bg-canvas px-4 py-8 sm:px-6 sm:py-12 print:bg-white print:p-0">
      <style>{`
        @page venue-sticker { size: A4 portrait; margin: 0; }
        @media print {
          .venue-sheet { page: venue-sticker; }
          .venue-sticker { width: 210mm; height: 148.5mm; border: 0; border-bottom: 1px dashed #858f99; break-inside: avoid; }
          .venue-sticker:nth-child(2n) { border-bottom: 0; break-after: page; }
        }
      `}</style>

      <div className="mx-auto max-w-[210mm] space-y-6 print:hidden">
        <div className="space-y-2">
          <Eyebrow>Venue map</Eyebrow>
          <h1 className="font-display text-3xl font-extrabold text-blue">QR stickers</h1>
          <p className="text-sm text-ink-3">
            Six stickers, two per A4 sheet. Put each one up at its spot in the venue: scanning it opens the venue map with that spot as the
            starting point. Cut along the dashed line.
          </p>
        </div>
        {local && (
          <Alert tone="error" title="These stickers point to this computer">
            They link to {base}. Print them from the live site so they work at the venue.
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <PrintButton>Print stickers</PrintButton>
          <ButtonLink href="/admin/booths" variant="outline">
            Back to booths
          </ButtonLink>
        </div>
      </div>

      <div className="venue-sheet mx-auto mt-8 max-w-[210mm] space-y-6 print:mt-0 print:max-w-none print:space-y-0">
        {stickers.map((s) => (
          <section
            key={s.id}
            aria-label={`Sticker ${s.id}, ${s.area}`}
            className="venue-sticker flex aspect-[210/148.5] flex-col justify-between overflow-hidden rounded-lg border border-line bg-white p-[12mm] text-blue print:rounded-none"
          >
            <div className="flex items-start justify-between gap-6 border-b-4 border-gold pb-[5mm]">
              <div>
                <p className="text-[9pt] font-bold uppercase tracking-[0.16em] text-gold-ink">NewSpace Africa Conference 2027</p>
                <p className="mt-1 font-display text-[16pt] font-extrabold">Venue map</p>
              </div>
              <p className="font-display text-[16pt] font-extrabold tabular-nums">{s.id}</p>
            </div>

            <div className="flex flex-1 items-center justify-between gap-[10mm] pt-[6mm]">
              <div className="min-w-0">
                <p className="text-[14pt] font-semibold text-ink-2">You are here</p>
                <p className="mt-1 font-display text-[34pt] font-extrabold leading-[1.05]">{s.area}</p>
                <p className="mt-[6mm] text-[18pt] font-bold text-ink">Scan to get directions</p>
                <p className="mt-1 text-[11pt] text-ink-2">Point your phone camera at the code to find booths, rooms and registration.</p>
                <p className="mt-[4mm] text-[8pt] text-ink-3 [overflow-wrap:anywhere]">{s.url}</p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- inline vector QR, prints sharp */}
              <img src={s.qr} alt={`QR code linking to ${s.url}`} className="h-[72mm] w-[72mm] shrink-0" />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
