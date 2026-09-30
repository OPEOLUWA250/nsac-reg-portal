import type { Metadata } from "next";
import SettingsPanel from "@/components/admin/SettingsPanel";

export const metadata: Metadata = {
  title: "Settings",
  description: "Staff: open or close registration and check how payments and email are set up.",
  robots: { index: false },
};

export default function AdminSettingsPage() {
  return <SettingsPanel />;
}
