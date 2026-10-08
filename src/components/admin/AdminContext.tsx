"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { APP_UPDATE_EVENT, APP_VERSION_HEADER, isNewerDeployment } from "@/lib/app-version";

// Shared by every /admin page: who is signed in, an API helper, and sign-out.
// The sign-in itself is a cookie session (Supabase Auth), sent with every
// request automatically; src/proxy.ts and adminRoute() check it.

export type ApiCall = (path: string, options?: RequestInit) => Promise<Record<string, unknown>>;

export interface AdminMe {
  email: string;
  role: "admin" | "super_admin";
}

interface AdminContextValue {
  apiCall: ApiCall;
  /** Null while loading. */
  me: AdminMe | null;
  /** Set by the notification bell: the dashboard opens this person's details. */
  requestedAttendee: string | null;
  setRequestedAttendee: (id: string | null) => void;
  signOut: () => Promise<void>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

const ACTIVITY_PING_MS = 5 * 60_000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

// The session ended (expired, signed out in another tab, access removed):
// back to the sign-in page, returning here afterwards.
function toLogin() {
  const here = window.location.pathname;
  window.location.assign(`/admin/login?next=${encodeURIComponent(here)}`);
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<AdminMe | null>(null);
  const [requestedAttendee, setRequestedAttendee] = useState<string | null>(null);

  const apiCall = useCallback<ApiCall>(async (path, options = {}) => {
    let res: Response;
    try {
      res = await fetch(path, {
        ...options,
        headers: { "Content-Type": "application/json", ...options.headers },
        signal: options.signal ?? AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error("Couldn't reach the server. Check your connection and try again.");
    }
    // A newer version went live: the shell offers a reload (UpdateBar).
    if (isNewerDeployment(res.headers.get(APP_VERSION_HEADER))) window.dispatchEvent(new Event(APP_UPDATE_EVENT));
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        toLogin();
        throw Object.assign(new Error("Your sign-in has ended. Sign in again."), { body: json, status: 401 });
      }
      if (res.status === 403 && json.error === "Set a new password before continuing.") {
        window.location.assign("/admin/reset-password");
      }
      // body carries extra detail, e.g. per-field errors.
      throw Object.assign(new Error(json.error ?? `Request failed (${res.status})`), { body: json, status: res.status });
    }
    return json;
  }, []);

  // Clicking, typing or scrolling keeps the sign-in alive; the dashboard's
  // background refreshes don't (src/lib/server/admin-idle.ts). Tell the
  // server at most every few minutes. The page load itself already counted.
  useEffect(() => {
    let reported = Date.now();
    const onActivity = () => {
      if (Date.now() - reported < ACTIVITY_PING_MS) return;
      reported = Date.now();
      apiCall("/api/auth/activity", { method: "POST" }).catch(() => undefined);
    };
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, onActivity, { passive: true });
    return () => {
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, onActivity);
    };
  }, [apiCall]);

  useEffect(() => {
    apiCall("/api/auth/session").then(
      (json) => setMe({ email: String(json.email), role: json.role === "super_admin" ? "super_admin" : "admin" }),
      () => undefined // 401 already redirects; anything else: the menu shows without a name
    );
  }, [apiCall]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/admin/login");
  }, []);

  const value = useMemo(
    () => ({ apiCall, me, requestedAttendee, setRequestedAttendee, signOut }),
    [apiCall, me, requestedAttendee, signOut]
  );
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside the /admin layout");
  return ctx;
}
