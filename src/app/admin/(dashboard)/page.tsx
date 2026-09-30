import type { Metadata } from "next";
import AdminDashboard from "@/components/AdminDashboard";

export const metadata: Metadata = {
  title: "Registrations",
  description: "Staff dashboard: registrations, payments, check-ins and walk-ins.",
  robots: { index: false },
};

export default function AdminPage() {
  return <AdminDashboard />;
}
