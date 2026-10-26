import {
  BOOTHS,
  BOOTH_SIZE_LABEL,
  ENTRANCE,
  FACILITIES,
  QR_POINTS,
  ZONES,
  type BoothSize,
  type FacilityCategory,
  type Point,
  type Rect,
  type ZoneId,
} from "@/lib/venue/data";

// Everything a route can start or end at, as one list: rooms, the entrance,
// facilities, booths and QR points. Booth names come from the exhibitor
// assignments (booth_assignments table), when there are any.

export type PlaceKind = "room" | "entrance" | "facility" | "booth" | "qr";

export interface Place {
  id: string;
  code: string;
  kind: PlaceKind;
  name: string;
  /** Second line in search results. */
  cat: string;
  anchor: Point;
  rect?: Rect;
  /** Rooms: "into the North Room". */
  into?: string;
  size?: BoothSize;
  room?: ZoneId;
  assigned?: boolean;
  website?: string | null;
  category?: FacilityCategory;
}

export interface Exhibitor {
  company: string;
  sector: string | null;
  website: string | null;
}

/** Booth code to exhibitor. Unassigned booths are absent. */
export type ExhibitorMap = Record<string, Exhibitor>;

const ROOM_NAME = Object.fromEntries(ZONES.map((z) => [z.id, z.name])) as Record<ZoneId, string>;

export function buildPlaces(exhibitors: ExhibitorMap = {}): Place[] {
  const places: Place[] = [];
  for (const z of ZONES) places.push({ id: z.id, code: z.code, kind: "room", name: z.name, cat: z.cat, anchor: z.anchor, rect: z.rect, into: z.into, room: z.id });
  places.push({ ...ENTRANCE, kind: "entrance" });
  for (const f of FACILITIES) places.push({ id: f.id, code: f.code, kind: "facility", name: f.name, cat: f.area, anchor: f.anchor, rect: f.rect, category: f.category });
  for (const b of BOOTHS) {
    const ex = exhibitors[b.code];
    const where = `${BOOTH_SIZE_LABEL[b.size]} · ${ROOM_NAME[b.room]}${b.note ? ` · ${b.note}` : ""}`;
    places.push({
      id: b.code,
      code: b.code,
      kind: "booth",
      name: ex ? ex.company : `Booth ${b.code}`,
      cat: ex ? [ex.sector, ROOM_NAME[b.room]].filter(Boolean).join(" · ") : `${where} · not yet assigned`,
      anchor: b.anchor,
      rect: b.rect,
      size: b.size,
      room: b.room,
      assigned: !!ex,
      website: ex?.website ?? null,
    });
  }
  for (const q of QR_POINTS) places.push({ id: q.id, code: q.id, kind: "qr", name: `QR point, ${q.area}`, cat: "QR point", anchor: q.anchor });
  return places;
}

/** How a place is named inside a sentence: "booth W-S4", "Sahel Orbital (W-S4)". */
export function nameInText(p: Pick<Place, "kind" | "name" | "code" | "assigned">): string {
  if (p.kind !== "booth") return p.name;
  return p.assigned ? `${p.name} (${p.code})` : `booth ${p.code}`;
}

/** Letters and digits only, upper case: "w-s4", "WS4" and "W S4" all match. */
export function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
