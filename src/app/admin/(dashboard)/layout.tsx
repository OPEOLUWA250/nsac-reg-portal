"use client";

import dynamic from "next/dynamic";
import { LoadingLabel, Skeleton } from "@/components/ui";

// Every signed-in admin page (sign-in pages live in ../(auth)). src/proxy.ts
// has already checked the sign-in before this renders. The shell renders in
// the browser only; its loading screen has the same frame: blue sidebar,
// white top bar.
const AdminShell = dynamic(() => import("@/components/admin/AdminShell"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-dvh flex-1">
      <LoadingLabel>Loading the admin</LoadingLabel>
      <div className="hidden w-64 shrink-0 bg-blue lg:block" />
      <div className="flex-1">
        <div className="h-16 border-b border-line bg-surface" />
        <div className="space-y-4 px-4 py-8 sm:px-6 lg:px-8">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-28 w-full max-w-6xl rounded-lg" />
        </div>
      </div>
    </div>
  ),
});

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminShell>{children}</AdminShell>;
}
