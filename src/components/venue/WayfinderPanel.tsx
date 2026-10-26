"use client";

import { useMemo } from "react";
import {
  faArrowLeft,
  faArrowRight,
  faArrowUp,
  faDoorOpen,
  faFlagCheckered,
  faLocationCrosshairs,
  faPersonWalking,
  faQrcode,
  faRightLeft,
  faRotateLeft,
  faRoute,
  faXmark,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import FaIcon from "@/components/FaIcon";
import { Card, Chip, Eyebrow, Field, buttonClass, cx, inputClass, linkClass } from "@/components/ui";
import { ZONES } from "@/lib/venue/data";
import type { Place, PlaceKind } from "@/lib/venue/places";
import type { Step, StepType } from "@/lib/venue/directions";
import { BOOTH_FILL } from "@/components/venue/VenueMap";

export type Filter = "all" | "booth" | "room" | "facility";
export const PIN = "__pin";

const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["booth", "Booths"],
  ["room", "Rooms & areas"],
  ["facility", "Facilities"],
];

const STEP_ICON: Record<StepType, IconDefinition> = {
  start: faArrowUp,
  left: faArrowLeft,
  right: faArrowRight,
  around: faRotateLeft,
  door: faDoorOpen,
  arrive: faFlagCheckered,
};

export interface RouteSummary {
  status: "none" | "same" | "unreachable" | "ok";
  metres: number;
  minutes: number;
  steps: Step[];
}

interface Props {
  places: Place[];
  fromValue: string;
  fromLabel: string;
  hasPin: boolean;
  onFromChange: (value: string) => void;
  picking: boolean;
  onTogglePicking: () => void;
  query: string;
  onQuery: (q: string) => void;
  filter: Filter;
  onFilter: (f: Filter) => void;
  to: Place | null;
  onChooseTo: (id: string) => void;
  summary: RouteSummary;
  activeStep: number | null;
  canSwap: boolean;
  onWalk: () => void;
  onSwap: () => void;
  onShowRoute: () => void;
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "");

const ZONE_ORDER = ZONES.map((z) => z.id as string);
const RANK: Partial<Record<PlaceKind, number>> = { room: 0, facility: 1, booth: 2 };

/** Search: booth code (hyphen optional), company, sector, room and area names. */
export function searchPlaces(places: Place[], query: string, filter: Filter): Place[] {
  const q = fold(query.trim());
  const qCode = q.replace(/ /g, "");
  return places
    .filter((p) => p.kind !== "qr" && p.kind !== "entrance")
    .filter((p) => filter === "all" || p.kind === filter)
    .filter((p) => !q || fold([p.code, p.code.replace(/-/g, ""), p.name, p.cat].join(" ")).includes(q))
    .sort((a, b) => {
      // An exact code ("ws1") comes before codes that only start with it (W-S10).
      const exact = Number(fold(b.code).replace(/ /g, "") === qCode) - Number(fold(a.code).replace(/ /g, "") === qCode);
      if (q && exact) return exact;
      const rank = (RANK[a.kind] ?? 3) - (RANK[b.kind] ?? 3);
      if (rank) return rank;
      if (a.kind === "room" && b.kind === "room") return ZONE_ORDER.indexOf(a.id) - ZONE_ORDER.indexOf(b.id);
      return a.code.localeCompare(b.code, undefined, { numeric: true });
    });
}

const fmtMetres = (m: number) => (m < 1 ? "" : `${Math.max(1, Math.round(m))} m`);

export default function WayfinderPanel(p: Props) {
  const results = useMemo(() => searchPlaces(p.places, p.query, p.filter), [p.places, p.query, p.filter]);
  const searching = p.query.trim() !== "";

  const fromGroups: [string, (x: Place) => boolean][] = [
    ["Entrance and QR points", (x) => x.kind === "entrance" || x.kind === "qr"],
    ["Rooms and areas", (x) => x.kind === "room"],
    ["Facilities", (x) => x.kind === "facility"],
    ["Booths", (x) => x.kind === "booth"],
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Eyebrow>NewSpace Africa Conference 2027 · Dakar</Eyebrow>
          <Chip dot="var(--color-gold)">Draft floor plan</Chip>
        </div>
        <h1 className="font-display text-3xl font-extrabold text-blue">Find your way around the venue</h1>
        <p className="text-sm text-ink-3">Choose where you are, then search for a booth number, room or desk. The map draws your walking route.</p>
      </header>

      <Field
        id="venue-from"
        label="You are at"
        hint={
          <>
            <FaIcon icon={faQrcode} className="mr-1.5 inline h-3.5 w-3.5 align-[-2px] text-blue" />
            At the venue, scan a QR sticker to set this for you. On the map, tap a QR point to do the same.
          </>
        }
      >
        <div className="flex gap-2">
          <select
            id="venue-from"
            value={p.fromValue}
            onChange={(e) => p.onFromChange(e.target.value)}
            aria-describedby="venue-from-hint"
            className={inputClass(false, "min-w-0 flex-1")}
          >
            {p.hasPin && <option value={PIN}>Spot you picked on the map</option>}
            {fromGroups.map(([label, test]) => (
              <optgroup key={label} label={label}>
                {p.places.filter(test).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.kind === "booth" ? `${x.code}${x.assigned ? ` · ${x.name}` : ""}` : x.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            onClick={p.onTogglePicking}
            aria-pressed={p.picking}
            className={cx(buttonClass(p.picking ? "secondary" : "outline", "md", "min-h-12 shrink-0 px-3.5"))}
          >
            <FaIcon icon={p.picking ? faXmark : faLocationCrosshairs} />
            {p.picking ? "Cancel" : "Pick on map"}
          </button>
        </div>
      </Field>

      <div className="space-y-3">
        <Field id="venue-to" label="Where to?" hint="A booth number such as W-S4, a company or a room.">
          <input
            id="venue-to"
            type="search"
            value={p.query}
            onChange={(e) => p.onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) {
                e.preventDefault();
                p.onChooseTo(results[0].id);
              }
            }}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="venue-to-hint"
            aria-controls="venue-results"
            className={inputClass()}
          />
        </Field>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
          {FILTERS.map(([f, label]) => (
            <button
              key={f}
              type="button"
              aria-pressed={p.filter === f}
              onClick={() => p.onFilter(f)}
              className={cx(
                "min-h-9 rounded-md border px-3 text-sm font-semibold transition-colors duration-150 pointer-coarse:min-h-11",
                p.filter === f ? "border-blue bg-blue text-white" : "border-line-strong bg-surface text-ink-2 hover:bg-subtle hover:text-ink active:bg-line"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <RouteCard {...p} />

      <section aria-labelledby="venue-results-label" className="space-y-2">
        <h2 id="venue-results-label" className="text-xs font-semibold uppercase tracking-wider text-ink-3">
          {searching ? `${results.length} ${results.length === 1 ? "match" : "matches"}` : "Places"}
        </h2>
        <Card className="overflow-hidden">
          {results.length ? (
            <ul id="venue-results" className="max-h-[26rem] divide-y divide-line overflow-y-auto overscroll-contain md:max-h-[22rem]">
              {results.map((x) => (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => p.onChooseTo(x.id)}
                    aria-current={x.id === p.to?.id ? "true" : undefined}
                    className={cx(
                      "grid min-h-12 w-full grid-cols-[3.75rem_1fr] items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-subtle focus-visible:-outline-offset-2",
                      x.id === p.to?.id && "bg-subtle"
                    )}
                  >
                    <CodeBadge place={x} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">{x.name}</span>
                      <span className="block text-sm text-ink-3">{x.cat}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p id="venue-results" className="px-4 py-4 text-sm text-ink-3">
              No match. Try a booth number like W-S4 or E-L2, or a room name.
            </p>
          )}
        </Card>
      </section>

      <details className="group border-t border-line pt-4 text-sm text-ink-3">
        <summary className="cursor-pointer rounded-sm font-semibold text-ink">About this map</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Built from the draft NSAC 2027 event floor plan (October 2026): 3 exhibition rooms, the main foyer, the registration foyer, the main entrance and the conference amphitheatre.</li>
          <li>Exhibitor names appear on booths once they are assigned. Toilets, catering, exits and other facilities will be added when they are confirmed.</li>
          <li>Walking distances are estimates based on the 247 sqm room size.</li>
        </ul>
      </details>
    </div>
  );
}

function CodeBadge({ place: x }: { place: Place }) {
  const booth = x.kind === "booth";
  return (
    <span
      className={cx("rounded-sm py-1 text-center text-xs font-bold tabular-nums", booth ? "text-[var(--map-booth-ink)]" : "bg-subtle text-ink")}
      style={booth ? { background: BOOTH_FILL[x.size!] } : undefined}
    >
      {x.code}
    </span>
  );
}

function RouteCard(p: Props) {
  const { summary, to } = p;
  const toLabel = to ? (to.kind === "booth" ? `${to.code} · ${to.assigned ? to.name : "booth not yet assigned"}` : to.name) : null;

  return (
    <Card aria-live="polite" aria-label="Your route" className="overflow-hidden">
      <div className="space-y-2 p-4">
        <p className="grid grid-cols-[1rem_1fr] items-center gap-2 text-sm">
          <span aria-hidden="true" className="h-3 w-3 justify-self-center rounded-full bg-[var(--map-you)] ring-2 ring-surface outline outline-1 outline-[var(--map-you)]" />
          <span>
            <span className="text-ink-3">From </span>
            <strong className="font-semibold">{p.fromLabel}</strong>
          </span>
        </p>
        <p className="grid grid-cols-[1rem_1fr] items-center gap-2 text-sm">
          <span aria-hidden="true" className="h-3 w-3 -rotate-45 justify-self-center rounded-[50%_50%_50%_0] bg-[var(--map-route)]" />
          <span>
            <span className="text-ink-3">To </span>
            {toLabel ? <strong className="font-semibold">{toLabel}</strong> : <span className="text-ink-3">choose a destination</span>}
            {to?.website && (
              <>
                {" · "}
                <a href={to.website} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  Website
                </a>
              </>
            )}
          </span>
        </p>

        {summary.status === "ok" && (
          <>
            <div className="flex items-baseline gap-5 pt-1">
              <span>
                <span className="font-display text-2xl font-bold tabular-nums text-ink">{Math.round(summary.metres)}</span>{" "}
                <span className="text-sm text-ink-3">metres</span>
              </span>
              <span>
                <span className="font-display text-2xl font-bold tabular-nums text-ink">{summary.minutes}</span>{" "}
                <span className="text-sm text-ink-3">min walk</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={p.onWalk} className={buttonClass("secondary", "sm")}>
                <FaIcon icon={faPersonWalking} />
                Preview the walk
              </button>
              <button type="button" onClick={p.onSwap} disabled={!p.canSwap} className={buttonClass("outline", "sm")}>
                <FaIcon icon={faRightLeft} />
                Swap
              </button>
              <button type="button" onClick={p.onShowRoute} className={buttonClass("outline", "sm")}>
                <FaIcon icon={faRoute} />
                Show route
              </button>
            </div>
          </>
        )}
      </div>

      {summary.status === "none" && (
        <p className="border-t border-line px-4 py-3 text-sm text-ink-3">Search above, pick a place from the list, or tap a booth on the map.</p>
      )}
      {summary.status === "same" && <p className="border-t border-line px-4 py-3 text-sm text-ink-3">You are already here.</p>}
      {summary.status === "unreachable" && (
        <p className="border-t border-line px-4 py-3 text-sm text-ink-3">No walkable route found. Try another starting point.</p>
      )}
      {summary.status === "ok" && (
        <ol className="border-t border-line py-1.5">
          {summary.steps.map((s, i) => (
            <li
              key={i}
              className={cx(
                "grid grid-cols-[1.75rem_1fr_auto] items-start gap-3 px-4 py-2 text-sm transition-colors duration-150",
                p.activeStep === i && "bg-subtle"
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  "flex h-7 w-7 items-center justify-center rounded-full",
                  s.type === "arrive" ? "bg-gold text-black" : "bg-subtle text-ink"
                )}
              >
                <FaIcon icon={STEP_ICON[s.type]} className="h-3.5 w-3.5" />
              </span>
              <span className="pt-1 text-ink">{s.text}</span>
              <span className="pt-1 tabular-nums text-ink-3">{fmtMetres(s.distanceM)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
