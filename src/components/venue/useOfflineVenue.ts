"use client";

import { useEffect, useSyncExternalStore } from "react";

// The venue map works without signal once it has been opened: the service
// worker in public/venue-sw.js saves the page and its files. Production only,
// so development builds are never served from a stale save.

const SW_URL = "/venue-sw.js";

/** Registers the service worker, then has it save what this page loaded. */
export function useOfflineVenue() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    let idle: number | undefined;
    navigator.serviceWorker
      .register(SW_URL, { scope: "/venue", updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // Once the page has settled (fonts, the route worker), so the list is complete.
        const send = () => {
          if (cancelled) return;
          const urls = performance.getEntriesByType("resource").map((e) => e.name);
          reg.active?.postMessage({ type: "save", urls });
        };
        // Safari has no requestIdleCallback.
        idle = typeof requestIdleCallback === "function" ? requestIdleCallback(send, { timeout: 4000 }) : window.setTimeout(send, 2000);
      })
      .catch(() => {
        /* no offline copy this time; the map still works online */
      });
    return () => {
      cancelled = true;
      if (idle === undefined) return;
      if (typeof cancelIdleCallback === "function") cancelIdleCallback(idle);
      else clearTimeout(idle);
    };
  }, []);
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

/** False while the phone has no connection. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}
