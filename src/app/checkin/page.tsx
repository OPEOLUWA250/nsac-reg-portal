"use client";

import dynamic from "next/dynamic";

// Camera access + localStorage-backed staff auth only make sense client-side.
const CheckInApp = dynamic(() => import("@/components/CheckInApp"), {
  ssr: false,
});

export default function CheckInPage() {
  return <CheckInApp />;
}
