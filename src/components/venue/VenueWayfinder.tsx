"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import VenueMap from "@/components/venue/VenueMap";
import WayfinderPanel, { PIN, type Filter, type RouteSummary } from "@/components/venue/WayfinderPanel";
import { BOOTHS, ENTRANCE, METRES_PER_UNIT, WALK_SPEED_MPS, type Point } from "@/lib/venue/data";
import { boothState, buildPlaces, type ExhibitorMap, type Place } from "@/lib/venue/places";
import { cellCenter, dist, hasGrid, pathLength, route, setGrid, snap, type Grid } from "@/lib/venue/pathfinding";
import { buildSteps, type RouteEnd } from "@/lib/venue/directions";
import { venueQuery } from "@/lib/venue/params";

// The venue wayfinder: where you are, where you're going, the route on the
// map and the steps. The URL follows along (?from=…&to=…) so a route can be
// shared; QR stickers open it with ?from= already set.

const DARK_QUERY = "(prefers-color-scheme: dark)";
const subscribeDark = (cb: () => void) => {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export default function VenueWayfinder({
  exhibitors,
  initialFrom,
  initialTo,
}: {
  exhibitors: ExhibitorMap;
  initialFrom: string;
  initialTo: string | null;
}) {
  const places = useMemo(() => buildPlaces(exhibitors), [exhibitors]);
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);

  const [fromId, setFromId] = useState(initialFrom);
  const [pin, setPin] = useState<Point | null>(null);
  const [toId, setToId] = useState<string | null>(initialTo);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [fitKey, setFitKey] = useState(0);
  const [walkKey, setWalkKey] = useState(0);
  const [activeStep, setActiveStep] = useState<number | null>(null);

  // Light or dark: the phone's setting until someone presses the map's button.
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const systemDark = useSyncExternalStore(subscribeDark, () => window.matchMedia(DARK_QUERY).matches, () => false);
  const dark = theme ? theme === "dark" : systemDark;

  const fromPlace: Place | null = fromId === PIN ? null : (byId.get(fromId) ?? null);
  const from: RouteEnd & { anchor: Point } =
    fromId === PIN && pin
      ? { id: PIN, kind: "entrance", code: "", name: "the spot you picked", anchor: pin }
      : (fromPlace ?? byId.get("entrance")!);
  const to = toId ? (byId.get(toId) ?? null) : null;

  const { pts, summary } = useMemo((): { pts: Point[] | null; summary: RouteSummary } => {
    if (!to) return { pts: null, summary: { status: "none", metres: 0, minutes: 0, steps: [] } };
    if (from.id === to.id || dist(from.anchor, to.anchor) < 1.5) return { pts: null, summary: { status: "same", metres: 0, minutes: 0, steps: [] } };
    const pts = route(from.anchor, to.anchor);
    if (!pts) return { pts: null, summary: { status: "unreachable", metres: 0, minutes: 0, steps: [] } };
    const metres = pathLength(pts) * METRES_PER_UNIT;
    return {
      pts,
      summary: { status: "ok", metres, minutes: Math.max(1, Math.round(metres / WALK_SPEED_MPS / 60)), steps: buildSteps(pts, from, to, places) },
    };
    // from is rebuilt each render; its id and anchor are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.id, from.anchor[0], from.anchor[1], to, places]);

  // Every change of start or destination: stop any walk preview, zoom to the new route.
  const changed = useCallback(() => {
    setWalkKey(0);
    setActiveStep(null);
    setFitKey((k) => k + 1);
  }, []);

  // Keep the address bar in step, without adding history entries.
  const first = useRef(true);
  useEffect(() => {
    const qs = venueQuery(fromPlace, to);
    if (first.current && qs === window.location.search) return void (first.current = false);
    first.current = false;
    window.history.replaceState(null, "", `${window.location.pathname}${qs}`);
  }, [fromPlace, to]);

  // Build the walking grid in the background, ready for the first route.
  useEffect(() => {
    if (hasGrid() || typeof Worker === "undefined") return;
    const worker = new Worker(new URL("../../lib/venue/grid.worker.ts", import.meta.url));
    worker.onmessage = (e: MessageEvent<Grid>) => {
      setGrid(e.data);
      worker.terminate();
      // One throwaway route while the page is idle warms up the route code, so
      // the first real one is quick too.
      const warm = () => route(ENTRANCE.anchor, BOOTHS[BOOTHS.length - 1].anchor);
      if ("requestIdleCallback" in window) requestIdleCallback(warm, { timeout: 2000 });
      else setTimeout(warm, 200);
    };
    worker.onerror = () => worker.terminate(); // the first route builds it instead
    return () => worker.terminate();
  }, []);

  // Escape leaves "Pick on map".
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPicking(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [picking]);

  const mapRef = useRef<HTMLElement>(null);
  const chooseTo = (id: string) => {
    const p = byId.get(id);
    if (!p) return;
    if (p.kind === "qr") {
      // Tapping a QR point on the map is the same as scanning its sticker.
      setFromId(id);
      setPin(null);
    } else setToId(id);
    changed();
  };
  const chooseFromList = (id: string) => {
    chooseTo(id);
    // On phones the map is above the list: bring it into view.
    if (window.matchMedia("(max-width: 767px)").matches) {
      mapRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }
  };

  const fromLabel =
    fromId === PIN ? "Spot you picked on the map" : from.kind === "booth" && fromPlace ? `${from.code} · ${boothState(fromPlace)}` : from.name;

  return (
    <main id="main" className="venue flex-1 bg-canvas text-ink" data-theme={theme ?? undefined}>
      <div className="flex flex-col md:grid md:h-[calc(100dvh-4rem)] md:grid-cols-[minmax(20rem,25rem)_1fr]">
        <aside aria-label="Venue guide" className="order-2 min-w-0 px-4 py-6 sm:px-6 md:order-none md:overflow-y-auto md:border-r md:border-line md:px-5">
          <WayfinderPanel
            places={places}
            fromValue={fromId === PIN ? PIN : from.id}
            fromLabel={fromLabel}
            hasPin={!!pin}
            onFromChange={(v) => {
              setFromId(v);
              if (v !== PIN) setPin(null);
              changed();
            }}
            picking={picking}
            onTogglePicking={() => setPicking((x) => !x)}
            query={query}
            onQuery={setQuery}
            filter={filter}
            onFilter={setFilter}
            to={to}
            onChooseTo={chooseFromList}
            summary={summary}
            activeStep={activeStep}
            // Swapping makes the destination the start; a QR point, the entrance or a picked spot can't be a destination.
            canSwap={!!to && fromId !== PIN && from.kind !== "qr" && from.kind !== "entrance"}
            onWalk={() => setWalkKey((k) => k + 1)}
            onSwap={() => {
              if (!to) return;
              setFromId(to.id);
              setToId(from.id);
              changed();
            }}
            onShowRoute={() => setFitKey((k) => k + 1)}
          />
        </aside>
        <section ref={mapRef} aria-label="Venue map" className="order-1 h-[58svh] min-h-[21rem] scroll-mt-16 md:order-none md:h-auto md:min-h-0">
          <VenueMap
            places={places}
            fromPt={from.anchor}
            to={to}
            pts={pts}
            steps={summary.steps}
            picking={picking}
            fitKey={fitKey}
            walkKey={walkKey}
            dark={dark}
            onToggleTheme={() => setTheme(dark ? "light" : "dark")}
            onActiveStep={setActiveStep}
            onTapPlace={chooseTo}
            onPick={(pt) => {
              // Stand on the nearest walkable spot, not inside a booth or a wall.
              setPin(cellCenter(snap(pt)));
              setFromId(PIN);
              setPicking(false);
              changed();
            }}
          />
        </section>
      </div>
    </main>
  );
}
