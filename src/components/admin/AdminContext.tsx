"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

// Shared by every /admin page: the staff code (entered once per device),
// an API helper that sends it, and the optional admin code needed for
// sensitive changes (prices, settings) when ADMIN_ACCESS_CODE is set.

export type ApiCall = (path: string, options?: RequestInit) => Promise<Record<string, unknown>>;

interface AdminContextValue {
  staffCode: string;
  apiCall: ApiCall;
  /** Kept in memory only (never stored), for the session. */
  adminCode: string;
  setAdminCode: (code: string) => void;
  signOut: () => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({
  staffCode,
  onSignOut,
  children,
}: {
  staffCode: string;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [adminCode, setAdminCode] = useState("");

  const apiCall = useCallback<ApiCall>(
    async (path, options = {}) => {
      const res = await fetch(path, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "x-staff-code": staffCode,
          ...(adminCode ? { "x-admin-code": adminCode } : {}),
          ...options.headers,
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // body carries extra detail, e.g. per-field errors.
        throw Object.assign(new Error(json.error ?? `Request failed (${res.status})`), { body: json });
      }
      return json;
    },
    [staffCode, adminCode]
  );

  const value = useMemo(
    () => ({ staffCode, apiCall, adminCode, setAdminCode, signOut: onSignOut }),
    [staffCode, apiCall, adminCode, onSignOut]
  );
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside the /admin layout");
  return ctx;
}
