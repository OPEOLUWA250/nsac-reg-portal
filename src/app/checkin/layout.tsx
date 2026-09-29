import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Check-in scanner",
  description: "Staff: scan attendees' QR codes, check them in and print their badges.",
  robots: { index: false },
};

export default function CheckInLayout({ children }: LayoutProps<"/checkin">) {
  return children;
}
