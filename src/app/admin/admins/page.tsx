import type { Metadata } from "next";
import AdminsPanel from "@/components/admin/AdminsPanel";

export const metadata: Metadata = {
  title: "Admins",
  description: "Staff: who can open the admin and the check-in scanner.",
  robots: { index: false },
};

export default function AdminAdminsPage() {
  return <AdminsPanel />;
}
