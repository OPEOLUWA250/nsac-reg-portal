import type { Metadata } from "next";
import AnalyticsPanel from "@/components/admin/AnalyticsPanel";

export const metadata: Metadata = {
  title: "Analytics",
  description: "Staff: registrations and revenue over time, tickets, and who is coming.",
  robots: { index: false },
};

export default function AdminAnalyticsPage() {
  return <AnalyticsPanel />;
}
