"use client";

import dynamic from "next/dynamic";

// The staff sign-in lives in localStorage, so the admin shell only renders
// in the browser.
const AdminShell = dynamic(() => import("@/components/admin/AdminShell"), { ssr: false });

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminShell>{children}</AdminShell>;
}
