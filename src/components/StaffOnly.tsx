"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { STAFF_CODE_KEY } from "@/components/StaffGate";

// Shows its children only on devices where a staff code has been entered
// (the scanner / admin sign-in). Public visitors never see staff links.

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("nsac-staff-code", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("nsac-staff-code", onChange);
  };
}

function hasStaffCode() {
  try {
    return Boolean(localStorage.getItem(STAFF_CODE_KEY));
  } catch {
    return false;
  }
}

export function useIsStaffDevice() {
  return useSyncExternalStore(subscribe, hasStaffCode, () => false);
}

export default function StaffOnly({ children }: { children: ReactNode }) {
  return useIsStaffDevice() ? <>{children}</> : null;
}
