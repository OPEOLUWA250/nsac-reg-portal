"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExhibitorMap } from "@/lib/venue/places";
import { BOOTHS_CHANGED, BOOTHS_CHANNEL, BOOTHS_URL } from "@/lib/venue/live";

// The booths on an open venue map follow the admin's changes: a Realtime
// message says something changed, then the list is fetched again. As a
// fallback (no Realtime, a dropped connection) the list is also checked every
// minute while the page is in view, and when the visitor comes back to it.

const POLL_MS = 60_000;

/** The booths, kept up to date, and when they last changed (for "Booths updated"). */
export function useLiveExhibitors(initial: ExhibitorMap): { exhibitors: ExhibitorMap; changedAt: number | null } {
  const [exhibitors, setExhibitors] = useState(initial);
  const [changedAt, setChangedAt] = useState<number | null>(null);
  const current = useRef(JSON.stringify(initial));

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(BOOTHS_URL, { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()).exhibitors as ExhibitorMap;
      const json = JSON.stringify(next);
      if (json === current.current) return;
      current.current = json;
      setExhibitors(next);
      setChangedAt(Date.now());
    } catch {
      /* offline: keep what's on the map */
    }
  }, []);

  // Realtime: loaded after the page, so it never slows the map down.
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    import("@supabase/supabase-js").then(({ createClient }) => {
      if (cancelled) return;
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const channel = client
        .channel(BOOTHS_CHANNEL)
        .on("broadcast", { event: BOOTHS_CHANGED }, () => void refresh())
        .subscribe();
      stop = () => void client.removeChannel(channel);
    }, () => {});
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [refresh]);

  // The fallback check.
  useEffect(() => {
    const visible = () => document.visibilityState === "visible";
    const timer = window.setInterval(() => visible() && void refresh(), POLL_MS);
    const onVisible = () => visible() && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [refresh]);

  return { exhibitors, changedAt };
}
