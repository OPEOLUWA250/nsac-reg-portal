import { normalizeCode, type Place } from "@/lib/venue/places";

// /venue?from=Q3&to=W-S4. QR stickers link with ?from=, shared routes carry
// both. Codes ignore case and punctuation ("ws4" is W-S4); anything unknown
// falls back to the defaults: start at the main entrance, no destination.

export const DEFAULT_FROM = "entrance";

type Query = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

/** The place a code in the URL means, by its code or id. */
export function findPlace(raw: string, places: Place[]): Place | null {
  const code = normalizeCode(raw);
  if (!code) return null;
  return places.find((p) => normalizeCode(p.code) === code || normalizeCode(p.id) === code) ?? null;
}

export function parseVenueQuery(query: Query, places: Place[]): { from: string; to: string | null } {
  const from = findPlace(first(query.from), places);
  const to = findPlace(first(query.to), places);
  return {
    from: from?.id ?? DEFAULT_FROM,
    // A QR point is where you stand, not somewhere to go.
    to: to && to.kind !== "qr" ? to.id : null,
  };
}

/** The query string for the current route ("" for the default view). */
export function venueQuery(from: Place | null, to: Place | null): string {
  const q = new URLSearchParams();
  if (from && from.id !== DEFAULT_FROM) q.set("from", from.code);
  if (to) q.set("to", to.code);
  const s = q.toString();
  return s ? `?${s}` : "";
}
