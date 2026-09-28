import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import SiteHeader from "@/components/SiteHeader";
import { EVENT_INFO } from "@/lib/event-info";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const SHARE_DESCRIPTION = `${EVENT_INFO.date.en} · ${EVENT_INFO.place.en}. Register for the NewSpace Africa Conference 2027 — the gathering of Africa's space industry leaders, innovators and partners.`;

export const metadata: Metadata = {
  // Needed so link previews (opengraph-image) get absolute URLs.
  metadataBase: new URL(process.env.PUBLIC_BASE_URL || "http://localhost:3000"),
  title: "NewSpace Africa Conference 2027 — Registration",
  description: SHARE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "NewSpace Africa Conference",
    title: "NewSpace Africa Conference 2027 — Registration is open",
    description: SHARE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "NewSpace Africa Conference 2027 — Registration is open",
    description: SHARE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-offwhite">
        <SiteHeader />
        <div className="flex-1 flex flex-col">{children}</div>
      </body>
    </html>
  );
}
