"use client";

import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  faCamera,
  faCircleInfo,
  faExpand,
  faIdBadge,
  faKitMedical,
  faMinus,
  faMoon,
  faMugHot,
  faPersonPraying,
  faPlus,
  faRestroom,
  faRightFromBracket,
  faSun,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import FaIcon, { FaGlyph } from "@/components/FaIcon";
import { cx } from "@/components/ui";
import {
  AC_UNITS,
  BOOTH_SIZE_LABEL,
  FACILITIES,
  MAP_H,
  MAP_LABELS,
  MAP_W,
  QR_POINTS,
  TABLES,
  ZONES,
  type FacilityCategory,
  type Point,
} from "@/lib/venue/data";
import { fitLabel, LINE_HEIGHT } from "@/lib/venue/label-fit";
import { wallsOf } from "@/lib/venue/pathfinding";
import type { Place } from "@/lib/venue/places";
import type { Step } from "@/lib/venue/directions";

// The floor plan as SVG, in map units (see src/lib/venue/data.ts). Pan by
// dragging, zoom with the wheel, a pinch or the buttons. Panning and zooming
// write the viewBox directly instead of re-rendering.

export const FACILITY_ICON: Record<FacilityCategory, IconDefinition> = {
  registration: faIdBadge,
  toilets: faRestroom,
  catering: faMugHot,
  exit: faRightFromBracket,
  prayer: faPersonPraying,
  media: faCamera,
  info: faCircleInfo,
  medical: faKitMedical,
};

export const BOOTH_FILL = { s: "var(--map-booth-s)", l: "var(--map-booth-l)", x: "var(--map-booth-x)" } as const;
/** Reserved booths: their size colour with white hatching (the same in lists and legends). */
export const RESERVED_SWATCH = "repeating-linear-gradient(135deg, var(--map-booth-l) 0 2px, #ffffff 2px 4px)";
const RESERVED_PATTERN = "venue-reserved";

type View = { x: number; y: number; w: number; h: number };
const FULL: View = { x: -2, y: -1, w: MAP_W + 4, h: MAP_H + 2 };
const viewBox = (v: View) => `${v.x} ${v.y} ${v.w} ${v.h}`;
const WALK_SPEED = 16; // map units per second in the preview
const CONTROLS_WIDTH = 60; // px: the map buttons (44) and their margin

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Props {
  places: Place[];
  fromPt: Point;
  to: Place | null;
  pts: Point[] | null;
  steps: Step[];
  picking: boolean;
  /** Changes when the map should zoom to the current route. */
  fitKey: number;
  /** Changes when the walk preview should play. */
  walkKey: number;
  dark: boolean;
  onToggleTheme: () => void;
  onActiveStep: (i: number | null) => void;
  onTapPlace: (id: string) => void;
  onPick: (pt: Point) => void;
  /** Pixels at the top covered by a card: routes are fitted below them. */
  insetTop?: number;
}

export default function VenueMap(props: Props) {
  const { places, fromPt, to, pts, steps, picking, fitKey, walkKey, dark, onToggleTheme } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const walkerRef = useRef<SVGCircleElement>(null);
  const view = useRef<View>({ ...FULL });
  const anim = useRef(0);
  const walkAnim = useRef(0);
  const fittedSize = useRef({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);

  // Event handlers read the latest props without re-binding.
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  const apply = () => svgRef.current?.setAttribute("viewBox", viewBox(view.current));

  function animateTo(target: View) {
    const svg = svgRef.current;
    if (!svg) return;
    cancelAnimationFrame(anim.current);
    const r = svg.getBoundingClientRect();
    fittedSize.current = { w: r.width, h: r.height };
    const inset = Math.min(latest.current.insetTop ?? 0, r.height / 2);
    // The map buttons down the right-hand side; only kept clear on narrow maps,
    // where the route would otherwise run under them.
    const right = r.width < 640 ? CONTROLS_WIDTH : 0;
    const ar = (r.width - right) / (r.height - inset) || 1;
    let { x, y, w, h } = target;
    if (w / h < ar) {
      const nw = h * ar;
      x -= (nw - w) / 2;
      w = nw;
    } else {
      const nh = w / ar;
      y -= (nh - h) / 2;
      h = nh;
    }
    // Room above for the card and beside for the buttons, so neither hides the route.
    const extra = (h / (r.height - inset)) * inset;
    y -= extra;
    h += extra;
    w += (w / (r.width - right)) * right;
    const goal = { x, y, w, h };
    const from = { ...view.current };
    if (reducedMotion()) {
      view.current = goal;
      apply();
      return;
    }
    const t0 = performance.now();
    const D = 520;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / D);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      view.current = {
        x: from.x + (goal.x - from.x) * e,
        y: from.y + (goal.y - from.y) * e,
        w: from.w + (goal.w - from.w) * e,
        h: from.h + (goal.h - from.h) * e,
      };
      apply();
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }

  function fitPoints(list: Point[], pad = 8) {
    const xs = list.map((p) => p[0]), ys = list.map((p) => p[1]);
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, x1 = Math.max(...xs) + pad, y1 = Math.max(...ys) + pad;
    const w = Math.max(55, x1 - x0), h = Math.max(32, y1 - y0);
    animateTo({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h });
  }

  /** Zoom to the route, or to start and destination, or show the whole venue. */
  function fitCurrent() {
    const { pts, to, fromPt } = latest.current;
    if (pts) fitPoints(pts);
    else if (to) fitPoints([fromPt, to.anchor], 14);
    else animateTo(FULL);
  }

  function toWorld(clientX: number, clientY: number): Point {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const w = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return [w.x, w.y];
  }

  function zoomAt(f: number, clientX: number, clientY: number) {
    cancelAnimationFrame(anim.current);
    const [px, py] = toWorld(clientX, clientY);
    const v = view.current;
    const nw = Math.min(FULL.w * 1.8, Math.max(20, v.w * f));
    const k = nw / v.w;
    view.current = { x: px - (px - v.x) * k, y: py - (py - v.y) * k, w: nw, h: v.h * k };
    apply();
  }

  function zoomCentre(f: number) {
    const r = svgRef.current!.getBoundingClientRect();
    zoomAt(f, r.left + r.width / 2, r.top + r.height / 2);
  }

  // Zoom to the route whenever asked, and refit when the map changes size.
  useEffect(() => {
    fitCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fitKey is the trigger; fitCurrent reads the latest props
  }, [fitKey]);
  // A card appearing over the map (not one going away, which would undo a pan).
  const lastInset = useRef(props.insetTop ?? 0);
  useEffect(() => {
    const inset = props.insetTop ?? 0;
    if (inset > lastInset.current) fitCurrent();
    lastInset.current = inset;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fitCurrent reads the latest props
  }, [props.insetTop]);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // Refit when the map's size changes from the one last fitted: a phone
    // turning, or a page first laid out at another size (browser dev tools,
    // a slow font) whose first fit was for the wrong shape.
    const ro = new ResizeObserver(() => {
      const r = svg.getBoundingClientRect();
      if (Math.abs(r.width - fittedSize.current.w) > 2 || Math.abs(r.height - fittedSize.current.h) > 2) fitCurrent();
    });
    ro.observe(svg);
    // The wheel needs a non-passive listener to stop the page scrolling.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      svg.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(anim.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set up once
  }, []);

  // Walk preview: a dot follows the route; the step it's on lights up.
  useEffect(() => {
    const walker = walkerRef.current;
    cancelAnimationFrame(walkAnim.current);
    if (!walker) return;
    walker.setAttribute("opacity", "0");
    if (!walkKey || !pts) return;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[cum.length - 1];
    const t0 = performance.now();
    let active = -1;
    walker.setAttribute("opacity", "1");
    fitPoints(pts);
    const frame = (now: number) => {
      const s = Math.min(total, ((now - t0) / 1000) * WALK_SPEED);
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const seg = cum[i] - cum[i - 1] || 1;
      const t = (s - cum[i - 1]) / seg;
      walker.setAttribute("cx", String(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t));
      walker.setAttribute("cy", String(pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t));
      let a = 0;
      steps.forEach((st, k) => {
        if (s >= st.at - 0.01) a = k;
      });
      if (s >= total) a = steps.length - 1;
      if (a !== active) {
        active = a;
        latest.current.onActiveStep(a);
      }
      if (s < total) walkAnim.current = requestAnimationFrame(frame);
    };
    walkAnim.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(walkAnim.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- replays on walkKey; a new route resets it
  }, [walkKey, pts]);

  // ---------- pointer: drag to pan, pinch to zoom, tap to choose ----------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, pinch: 0, target: null as Element | null });

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) gesture.current = { moved: 0, pinch: 0, target: e.target as Element };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.moved = 99; // a pinch is never a tap
    }
    cancelAnimationFrame(anim.current);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size === 1) {
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      gesture.current.moved += Math.abs(dx) + Math.abs(dy);
      if (gesture.current.moved > 5) setDragging(true);
      const r = svgRef.current!.getBoundingClientRect();
      const s = Math.max(view.current.w / r.width, view.current.h / r.height);
      view.current = { ...view.current, x: view.current.x - dx * s, y: view.current.y - dy * s };
      apply();
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture.current.pinch) zoomAt(gesture.current.pinch / d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      gesture.current.pinch = d;
    }
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    setDragging(false);
    if (pointers.current.size === 0 && gesture.current.moved <= 5) tap(e.clientX, e.clientY, gesture.current.target);
    if (pointers.current.size < 2) gesture.current.pinch = 0;
  };

  const onPointerCancel = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    setDragging(false);
  };

  function tap(clientX: number, clientY: number, target: Element | null) {
    const { picking, onPick, onTapPlace } = latest.current;
    if (picking) return onPick(toWorld(clientX, clientY));
    const id = target?.closest("[data-id]")?.getAttribute("data-id");
    if (id) onTapPlace(id);
  }

  const routeD = pts ? "M" + pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" L") : null;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1">
        <svg
          ref={svgRef}
          viewBox={viewBox(FULL)}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="NSAC 2027 venue floor plan with your walking route"
          className={cx(
            "block h-full w-full touch-none select-none",
            picking ? "cursor-crosshair" : dragging ? "cursor-grabbing" : "cursor-grab"
          )}
          style={{ background: "var(--map-bg)" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <FloorPlan places={places} selectedId={to?.id ?? null} />

          {routeD && (
            <g>
              <path d={routeD} fill="none" stroke="var(--map-casing)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
              <path d={routeD} fill="none" stroke="var(--map-route)" strokeWidth={0.95} strokeLinecap="round" strokeLinejoin="round" />
              <path d={routeD} fill="none" stroke="var(--map-casing)" strokeWidth={0.3} strokeLinecap="round" opacity={0.85} className="venue-flow" />
            </g>
          )}

          <QrMarkers />

          {to && (
            <g transform={`translate(${to.anchor[0]} ${to.anchor[1]}) scale(1.4)`} aria-hidden="true">
              <path
                d="M0 0 C -.2 -.7 -1.1 -1.2 -1.1 -2.1 A 1.1 1.1 0 1 1 1.1 -2.1 C 1.1 -1.2 .2 -.7 0 0Z"
                fill="var(--map-route)"
                stroke="var(--map-casing)"
                strokeWidth={0.18}
              />
              <circle cx={0} cy={-2.1} r={0.42} fill="var(--map-casing)" />
            </g>
          )}
          <circle cx={fromPt[0]} cy={fromPt[1]} r={1.1} fill="var(--map-you)" className="venue-pulse" />
          <circle cx={fromPt[0]} cy={fromPt[1]} r={1.05} fill="var(--map-you)" stroke="var(--map-casing)" strokeWidth={0.38} />
          <circle ref={walkerRef} cx={fromPt[0]} cy={fromPt[1]} r={0.8} fill="var(--map-route)" stroke="var(--map-casing)" strokeWidth={0.28} opacity={0} />
        </svg>

        {picking && (
          <p className="pointer-events-none absolute left-1/2 top-3 max-w-[calc(100%-7rem)] -translate-x-1/2 rounded-md bg-gold px-4 py-2 text-center text-sm font-semibold text-black">
            Tap the map where you are standing
          </p>
        )}

        <div className="absolute right-3 top-3 flex flex-col gap-2">
          <MapButton label="Zoom in" onClick={() => zoomCentre(1 / 1.4)} icon={faPlus} />
          <MapButton label="Zoom out" onClick={() => zoomCentre(1.4)} icon={faMinus} />
          <MapButton label="Show the whole venue" onClick={() => animateTo(FULL)} icon={faExpand} />
          <MapButton label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={onToggleTheme} icon={dark ? faSun : faMoon} />
        </div>
      </div>

      <Legend />
    </div>
  );
}

function MapButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: IconDefinition }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-line-strong bg-surface text-ink transition-colors duration-150 hover:bg-subtle active:bg-line"
    >
      <FaIcon icon={icon} className="h-4 w-4" />
    </button>
  );
}

function Legend() {
  const items: [string, string, boolean?][] = [
    [BOOTH_FILL.s, BOOTH_SIZE_LABEL.s],
    [BOOTH_FILL.l, BOOTH_SIZE_LABEL.l],
    [BOOTH_FILL.x, BOOTH_SIZE_LABEL.x],
    [RESERVED_SWATCH, "Reserved"],
    ["var(--map-you)", "You", true],
    ["var(--map-route)", "Destination"],
  ];
  return (
    <div
      aria-hidden="true"
      className="flex flex-wrap justify-center gap-x-4 gap-y-1 border-t border-line bg-surface px-3 py-2 text-xs text-ink-2 md:absolute md:bottom-3 md:left-3 md:max-w-[calc(100%-1.5rem)] md:justify-start md:rounded-lg md:border"
    >
      {items.map(([color, text, round]) => (
        <span key={text} className="inline-flex items-center gap-1.5">
          <i className={cx("inline-block h-3 w-3", round ? "rounded-full" : "rounded-sm")} style={{ background: color }} />
          {text}
        </span>
      ))}
    </div>
  );
}

// ---------- the plan itself (redrawn only when names or the destination change) ----------

/** Rooms, furniture, walls, booths and labels. Also used by /admin/booths, with free booths faded. */
export const FloorPlan = memo(function FloorPlan({ places, selectedId, fadeFree = false }: { places: Place[]; selectedId: string | null; fadeFree?: boolean }) {
  const booths = places.filter((p) => p.kind === "booth");
  const selectedStroke = (id: string) => (id === selectedId ? { stroke: "var(--map-route)", strokeWidth: 0.5 } : {});

  return (
    <g>
      <defs>
        <pattern id={RESERVED_PATTERN} width={0.9} height={0.9} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={0.35} height={0.9} fill="#ffffff" opacity={0.55} />
        </pattern>
      </defs>
      {/* Rooms */}
      {ZONES.map((z) => (
        <rect
          key={z.id}
          data-id={z.id}
          x={z.rect[0]}
          y={z.rect[1]}
          width={z.rect[2]}
          height={z.rect[3]}
          fill={z.fill === "hall" ? "var(--map-hall)" : "var(--map-floor)"}
          className="cursor-pointer"
          {...selectedStroke(z.id)}
        />
      ))}

      {/* Amphitheatre seating, ACs and cocktail tables (decorative) */}
      <g aria-hidden="true">
        {Array.from({ length: 13 }, (_, c) =>
          Array.from({ length: 3 }, (_, r) => (
            <rect key={`${c}-${r}`} x={63 + c * 4.63} y={9.6 + r * 1.35} width={3.3} height={1} rx={0.15} fill="var(--map-seat)" />
          ))
        )}
        {AC_UNITS.map(([x, y, w, h], i) => (
          <g key={i}>
            <rect x={x} y={y} width={w} height={h} fill="var(--map-ac)" stroke="var(--map-ac-line)" strokeWidth={0.15} />
            <text x={x + w / 2} y={y + h / 2 + 0.3} textAnchor="middle" fontSize={0.8} fontWeight={700} fill="var(--map-sublabel)" className="pointer-events-none">
              AC
            </text>
          </g>
        ))}
        {TABLES.map(([x, y, w, h], i) => (
          <g key={i}>
            <rect x={x} y={y} width={w} height={h} rx={0.7} fill="var(--map-table)" stroke="var(--map-table-line)" strokeWidth={0.18} />
            <circle cx={x + w / 2} cy={y + h / 2} r={0.3} fill="var(--map-table-line)" />
          </g>
        ))}
      </g>

      {/* Facilities: drawn desks, or an icon where there's no outline */}
      {FACILITIES.map((f) => {
        if (f.rect) {
          const [x, y, w, h] = f.rect;
          const cxp = x + w / 2, cyp = y + h / 2;
          return (
            <g key={f.id} data-id={f.id} className="cursor-pointer">
              <rect x={x} y={y} width={w} height={h} fill="var(--map-desk)" stroke={f.id === selectedId ? "var(--map-route)" : "var(--map-wall)"} strokeWidth={f.id === selectedId ? 0.5 : 0.2} />
              {f.mapLabel && (
                <text
                  x={cxp}
                  y={cyp + 0.35}
                  textAnchor="middle"
                  fontSize={0.95}
                  fontWeight={700}
                  letterSpacing={0.06}
                  fill="var(--map-label)"
                  transform={`rotate(-90 ${cxp} ${cyp})`}
                  className="pointer-events-none font-sans"
                >
                  {f.mapLabel}
                </text>
              )}
            </g>
          );
        }
        return (
          <g key={f.id} data-id={f.id} className="cursor-pointer">
            <circle cx={f.anchor[0]} cy={f.anchor[1]} r={1.4} fill="var(--map-desk)" stroke={f.id === selectedId ? "var(--map-route)" : "var(--map-wall)"} strokeWidth={0.22} />
            <FaGlyph icon={FACILITY_ICON[f.category]} cx={f.anchor[0]} cy={f.anchor[1]} size={1.5} fill="var(--map-label)" />
          </g>
        );
      })}

      {/* Walls, with gaps at the doors */}
      <g aria-hidden="true">
        {ZONES.flatMap((z) => wallsOf(z.rect, z.doors)).map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} fill="var(--map-wall)" />
        ))}
      </g>

      {/* Booths */}
      {booths.map((p) => (
        <BoothShape key={p.id} place={p} selected={p.id === selectedId} faded={fadeFree && p.status === "free"} />
      ))}

      {/* Room names */}
      <g aria-hidden="true" className="pointer-events-none">
        {MAP_LABELS.map((l) => (
          <text
            key={`${l.text}-${l.x}`}
            x={l.x}
            y={l.y}
            textAnchor="middle"
            fontSize={l.size}
            fontWeight={l.sub ? 500 : 800}
            letterSpacing={l.sub ? 0 : l.size * 0.06}
            fill={l.sub ? "var(--map-sublabel)" : "var(--map-label)"}
            transform={l.rotate ? `rotate(${l.rotate} ${l.x} ${l.y})` : undefined}
            className={l.sub ? "font-sans" : "font-display"}
          >
            {l.text}
          </text>
        ))}
        {/* Way in */}
        <path d="M94 113.4 L94 110.2 M92.6 111.6 L94 110.2 L95.4 111.6" stroke="var(--map-wall)" strokeWidth={0.45} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </g>
  );
});

function BoothShape({ place: p, selected, faded = false }: { place: Place; selected: boolean; faded?: boolean }) {
  const [x, y, w, h] = p.rect!;
  const big = p.size === "x";
  const fs = big ? 1.5 : Math.min(1.3, w / 3.4);
  const ink = selected ? "#000000" : "var(--map-booth-ink)";
  const reserved = p.status === "reserved" && !selected;
  // An assigned booth leads with the company's name (or "Reserved"), as big as
  // the booth allows over up to three lines, with the code small above it.
  const label = p.assigned ? p.name : p.status === "reserved" ? "Reserved" : null;
  const codeSize = big ? 1 : 0.62;
  const fitIn = (bw: number, bh: number) => (label ? fitLabel(label, bw - 0.7, bh - 0.6 - codeSize * LINE_HEIGHT, big ? 2.2 : 1.6) : null);
  // Tall, narrow booths turn the name sideways when that makes it clearly bigger.
  const flat = fitIn(w, h);
  const upright = h > w ? fitIn(h, w) : null;
  const turned = !!upright && (!flat || upright.size > flat.size * 1.2);
  const fit = turned ? upright : flat;
  const [cxB, cyB] = [x + w / 2, y + h / 2];
  const top = fit ? cyB - ((codeSize + fit.lines.length * fit.size) * LINE_HEIGHT) / 2 : 0;
  // Otherwise the code alone, centred (with the size under it on the big booths).
  const sub = big && !fit ? "6 × 6 m" : null;
  return (
    <g data-id={p.id} className="cursor-pointer [&:hover>rect]:brightness-110" opacity={faded && !selected ? 0.4 : undefined}>
      {fit && <title>{`${p.code} · ${label}`}</title>}
      <rect
        x={x + 0.1}
        y={y + 0.1}
        width={w - 0.2}
        height={h - 0.2}
        rx={0.45}
        fill={selected ? "var(--map-route)" : BOOTH_FILL[p.size!]}
        stroke={selected ? "var(--map-route)" : "var(--map-casing)"}
        strokeWidth={0.15}
      />
      {reserved && <rect x={x + 0.1} y={y + 0.1} width={w - 0.2} height={h - 0.2} rx={0.45} fill={`url(#${RESERVED_PATTERN})`} className="pointer-events-none" />}
      {fit ? (
        <g transform={turned ? `rotate(-90 ${cxB} ${cyB})` : undefined}>
          <text x={cxB} y={top + codeSize * 0.92} textAnchor="middle" fontSize={codeSize} fontWeight={600} fill={ink} opacity={0.85} className="pointer-events-none font-sans tabular-nums">
            {p.code}
          </text>
          <text textAnchor="middle" fontSize={fit.size} fontWeight={800} fill={ink} className="pointer-events-none font-sans">
            {fit.lines.map((line, i) => (
              <tspan key={i} x={cxB} y={top + codeSize * LINE_HEIGHT + fit.size * (LINE_HEIGHT * i + 0.92)}>
                {line}
              </tspan>
            ))}
          </text>
        </g>
      ) : (
        <text x={x + w / 2} y={y + h / 2 + fs * 0.35 - (sub ? 0.7 : 0)} textAnchor="middle" fontSize={fs} fontWeight={700} fill={ink} className="pointer-events-none font-sans tabular-nums">
          {p.code}
        </text>
      )}
      {sub && (
        <text x={x + w / 2} y={y + h / 2 + 1.5} textAnchor="middle" fontSize={0.95} fontWeight={600} fill={ink} className="pointer-events-none font-sans">
          {sub}
        </text>
      )}
    </g>
  );
}

function QrMarkers() {
  return (
    <g>
      {QR_POINTS.map(({ id, area, anchor: [x, y] }) => (
        <g key={id} data-id={id} className="cursor-pointer">
          <title>{`QR point, ${area}. Tap to start from here.`}</title>
          {/* A bigger invisible target, easier to hit with a finger */}
          <rect x={x - 1.4} y={y - 1.4} width={2.8} height={2.8} fill="transparent" />
          <rect x={x - 0.7} y={y - 0.7} width={1.4} height={1.4} rx={0.15} fill="var(--color-surface)" stroke="var(--map-wall)" strokeWidth={0.26} />
          <rect x={x - 0.25} y={y - 0.25} width={0.5} height={0.5} fill="var(--map-wall)" />
        </g>
      ))}
    </g>
  );
}
