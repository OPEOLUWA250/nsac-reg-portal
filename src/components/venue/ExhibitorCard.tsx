"use client";

import { faArrowUpRightFromSquare, faChevronDown, faXmark } from "@fortawesome/free-solid-svg-icons";
import FaIcon from "@/components/FaIcon";
import { Card, buttonClass } from "@/components/ui";
import { BOOTH_FILL } from "@/components/venue/VenueMap";
import { BOOTH_SIZE_LABEL, ZONES } from "@/lib/venue/data";
import type { Place } from "@/lib/venue/places";

// Who is at a sold booth: shown in the panel when it's the destination, and,
// on phones, as a short card over the map (the panel is below the fold there).

export const EXHIBITOR_CARD_ID = "venue-exhibitor";

const ROOM_NAME = Object.fromEntries(ZONES.map((z) => [z.id, z.name])) as Record<string, string>;

/** "https://www.sahelorbital.com/en" -> "sahelorbital.com". */
export function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function BoothBadge({ place: x }: { place: Place }) {
  return (
    <span className="rounded-sm px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--map-booth-ink)]" style={{ background: BOOTH_FILL[x.size!] }}>
      {x.code}
    </span>
  );
}

function WebsiteLink({ url, className }: { url: string; className?: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
      <FaIcon icon={faArrowUpRightFromSquare} className="h-3.5 w-3.5" />
      {siteName(url)}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export default function ExhibitorCard({ place: x }: { place: Place }) {
  return (
    <Card id={EXHIBITOR_CARD_ID} aria-labelledby="venue-exhibitor-name" className="scroll-mt-20 space-y-3 border-t-4 border-t-gold p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
        <BoothBadge place={x} />
        <span>
          {BOOTH_SIZE_LABEL[x.size!]} booth · {ROOM_NAME[x.room!]}
        </span>
      </div>
      <div className="space-y-0.5">
        <h2 id="venue-exhibitor-name" className="font-display text-xl font-bold leading-tight text-blue">
          {x.name}
        </h2>
        {x.sector && <p className="text-sm font-semibold text-ink-2">{x.sector}</p>}
      </div>
      {x.description && <p className="text-sm text-ink-2">{x.description}</p>}
      {x.website && <WebsiteLink url={x.website} className={buttonClass("outline", "sm", "max-w-full")} />}
    </Card>
  );
}

/** The phone version, over the map: name, booth and a way to the full card. */
export function ExhibitorPeek({ place: x, onClose }: { place: Place; onClose: () => void }) {
  const more = !!(x.description || x.website);
  return (
    <div
      role="region"
      aria-label={`Exhibitor at ${x.code}`}
      className="absolute left-3 top-3 z-10 w-[calc(100%-5.5rem)] max-w-sm rounded-lg border border-line border-t-4 border-t-gold bg-surface p-3 pr-11 transition-[opacity,translate] duration-200 starting:-translate-y-1 starting:opacity-0 md:hidden"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Hide exhibitor"
        className="absolute right-1 top-1 inline-flex h-11 w-11 items-center justify-center rounded-md text-ink-3 transition-colors duration-150 hover:bg-subtle hover:text-ink"
      >
        <FaIcon icon={faXmark} />
      </button>
      <div className="flex items-center gap-2">
        <BoothBadge place={x} />
        <p className="min-w-0 truncate font-display text-base font-bold text-blue">{x.name}</p>
      </div>
      <div className="mt-0.5 flex min-h-9 items-center gap-3 text-sm">
        {x.sector && <span className="min-w-0 truncate text-ink-3">{x.sector}</span>}
        {more && (
          <button
            type="button"
            onClick={() =>
              document
                .getElementById(EXHIBITOR_CARD_ID)
                ?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })
            }
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 font-semibold text-blue underline underline-offset-2"
          >
            More<span className="sr-only"> about {x.name}</span>
            <FaIcon icon={faChevronDown} className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
