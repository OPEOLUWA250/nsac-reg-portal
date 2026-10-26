import type { Metadata } from "next";
import BoothsPanel from "@/components/admin/BoothsPanel";

export const metadata: Metadata = {
  title: "Booths",
  description: "Staff: which exhibitor has which booth on the venue map.",
  robots: { index: false },
};

export default function AdminBoothsPage() {
  return <BoothsPanel />;
}
