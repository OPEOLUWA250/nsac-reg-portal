import type { Metadata } from "next";
import { DM_Sans, Raleway } from "next/font/google";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { EVENT_INFO } from "@/lib/event-info";
import { publicBaseUrl } from "@/lib/public-url";
import "./globals.css";

// Brand type, the same as the conference website (see DESIGN.md): Raleway
// for titles and numbers, DM Sans for everything else. The flyer and ticket
// images use the same two.
const raleway = Raleway({
  variable: "--font-raleway",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
