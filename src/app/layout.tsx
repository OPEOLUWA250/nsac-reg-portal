import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import SiteHeader from "@/components/SiteHeader";
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

export const metadata: Metadata = {
  title: "NewSpace Africa — Registration Portal",
  description:
    "Check-in and badge printing portal for the NewSpace Africa Conference.",
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
