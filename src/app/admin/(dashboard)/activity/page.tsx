import type { Metadata } from "next";
import ActivityPanel from "@/components/admin/ActivityPanel";

export const metadata: Metadata = {
  title: "Activity",
  description: "What admins have done in the admin, newest first.",
  robots: { index: false },
};

export default function AdminActivityPage() {
  return <ActivityPanel />;
}
