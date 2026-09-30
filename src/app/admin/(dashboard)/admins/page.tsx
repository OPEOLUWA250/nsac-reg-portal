import type { Metadata } from "next";
import AdminsPanel from "@/components/admin/AdminsPanel";

export const metadata: Metadata = {
  title: "Admins",
  description: "Who can sign in to the admin, and the check-in scanner's staff code.",
  robots: { index: false },
};

export default function AdminAdminsPage() {
  return <AdminsPanel />;
}
