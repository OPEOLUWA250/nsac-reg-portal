"use client";

import dynamic from "next/dynamic";

// localStorage-backed staff auth only makes sense client-side.
const AdminDashboard = dynamic(() => import("@/components/AdminDashboard"), {
  ssr: false,
});

export default function AdminPage() {
  return <AdminDashboard />;
}
