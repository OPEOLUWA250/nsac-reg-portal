import type { Metadata } from "next";
import localFont from "next/font/local";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { EVENT_INFO } from "@/lib/event-info";
import { publicBaseUrl } from "@/lib/public-url";
import "./globals.css";

// Brand type, the same as the conference website (see DESIGN.md): Raleway
// for titles and numbers, DM Sans for everything else. The flyer and ticket
// images use the same two.
//
// Self-hosted (src/app/fonts) rather than next/font/google: Google Fonts
// sometimes answers with font links that Turbopack can't load ("next/font/
// google queries have exactly one entry"), which broke `next dev` and could
// break a deploy. The files are the open-source fonts (SIL OFL, licences
// alongside), cut to the weights used and to Latin plus Latin Extended,
// matching what Google served. The Raleway cut is named "NSAC Display"
// inside the file, as its licence's Reserved Font Name requires.
const raleway = localFont({
  src: "./fonts/nsac-display.woff2",
  variable: "--font-raleway",
  weight: "700 800",
  display: "swap",
});

const dmSans = localFont({
  src: "./fonts/dm-sans.woff2",
  variable: "--font-dm-sans",
  weight: "400 700",
  display: "swap",
});

const SHARE_TITLE = `Register for ${EVENT_INFO.name.en}`;
const SHARE_DESCRIPTION = `${EVENT_INFO.date.en}, ${EVENT_INFO.place.en}. Register for the gathering of Africa's space industry leaders, innovators and partners, and get your QR ticket by email.`;

export const metadata: Metadata = {
  // Needed so link previews (opengraph-image) get absolute URLs.
  metadataBase: new URL(publicBaseUrl() ?? "http://localhost:3000"),
  title: {
    default: `${EVENT_INFO.name.en} | Registration`,
    template: "%s | NewSpace Africa 2027",
  },
  description: SHARE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "NewSpace Africa Conference",
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${raleway.variable} ${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        <SiteHeader />
        <div className="flex-1 flex flex-col">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
