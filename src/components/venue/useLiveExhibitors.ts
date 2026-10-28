"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExhibitorMap } from "@/lib/venue/places";
import { BOOTHS_CHECK_MS, BOOTHS_MIN_GAP_MS, BOOTHS_URL } from "@/lib/venue/live";

// The booths on an open venue map follow the admin's changes: the shared list
// is fetched again every few minutes while the page is on screen, and when
// the visitor comes back to it (src/lib/venue/live.ts says why it isn't a
// live connection).

/** The booths, kept up to date, and when they last changed (for "Booths updated"). */
export function useLiveExhibitors(initial: ExhibitorMap): { exhibitors: ExhibitorMap; changedAt: number | null } {
  const [exhibitors, setExhibitors] = useState(initial);
  const [changedAt, setChangedAt] = useState<number | null>(null);
  const current = useRef(JSON.stringify(initial));
  const lastCheck = useRef(0);

  const refresh = useCallback(async () => {
    if (Date.now() - lastCheck.current < BOOTHS_MIN_GAP_MS) return;
    lastCheck.current = Date.now();
    try {
      const res = await fetch(BOOTHS_URL);
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

  useEffect(() => {
    // The page was just loaded with the list, so the first check waits.
    lastCheck.current = Date.now();
    const visible = () => document.visibilityState === "visible";
    // Each phone checks at its own moment, so a full hall doesn't ask all at once.
    const every = BOOTHS_CHECK_MS * (0.8 + Math.random() * 0.4);
    const timer = window.setInterval(() => visible() && void refresh(), every);
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
