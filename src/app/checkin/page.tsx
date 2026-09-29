"use client";

import dynamic from "next/dynamic";
import { LoadingLabel, Skeleton } from "@/components/ui";

// Camera access + localStorage-backed staff auth only make sense client-side.
const CheckInApp = dynamic(() => import("@/components/CheckInApp"), {
  ssr: false,
  loading: () => (
    <main id="main" className="flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <LoadingLabel>Loading the scanner</LoadingLabel>
      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-6 h-72 w-full max-w-sm rounded-lg" />
      </div>
    </main>
  ),
});

export default function CheckInPage() {
  return <CheckInApp />;
}
