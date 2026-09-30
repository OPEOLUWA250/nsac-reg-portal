import type { Metadata } from "next";
import AdminsPanel from "@/components/admin/AdminsPanel";

export const metadata: Metadata = {
  title: "Admins",
  description: "Manage admin accounts and access to the check-in scanner.",
  robots: { index: false },
};

export default function AdminAdminsPage() {
  return <AdminsPanel />;
}
