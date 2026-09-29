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
  /** The server said the saved staff code is wrong (e.g. it was changed). */
  staffCodeRejected: boolean;
  /** Set by the notification bell: the dashboard opens this person's details. */
  requestedAttendee: string | null;
  setRequestedAttendee: (id: string | null) => void;
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
  const [staffCodeRejected, setStaffCodeRejected] = useState(false);
  const [requestedAttendee, setRequestedAttendee] = useState<string | null>(null);

  const apiCall = useCallback<ApiCall>(
    async (path, options = {}) => {
      let res: Response;
      try {
        res = await fetch(path, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            "x-staff-code": staffCode,
            ...(adminCode ? { "x-admin-code": adminCode } : {}),
            ...options.headers,
          },
          signal: options.signal ?? AbortSignal.timeout(30_000),
        });
      } catch {
        throw new Error("Couldn't reach the server. Check your connection and try again.");
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 401 = wrong staff code (a wrong admin code is a 403): this device
        // must sign in again.
        if (res.status === 401) {
          setStaffCodeRejected(true);
          throw Object.assign(new Error("Your access code no longer works."), { body: json, status: 401 });
        }
        // body carries extra detail, e.g. per-field errors.
        throw Object.assign(new Error(json.error ?? `Request failed (${res.status})`), { body: json, status: res.status });
      }
      return json;
    },
    [staffCode, adminCode]
  );

  const value = useMemo(
    () => ({ staffCode, apiCall, adminCode, setAdminCode, staffCodeRejected, requestedAttendee, setRequestedAttendee, signOut: onSignOut }),
    [staffCode, apiCall, adminCode, staffCodeRejected, requestedAttendee, onSignOut]
  );
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside the /admin layout");
  return ctx;
}
