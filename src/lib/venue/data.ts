// Venue geometry for the wayfinder (/venue), traced from the draft NSAC 2027
// floor plan (docs/wayfinder/Floorplan-2027.pdf) and ported unchanged from the
// approved prototype (docs/wayfinder/wayfinder-reference.html).
//
// Units: 1 map unit = 10 px of the 2000 px-wide floor-plan render, and about
// 0.304 m (each exhibition room is 247 sqm). Rects are [x, y, width, height].
//
// Known gaps in the draft plan, kept as drawn rather than "fixed":
//   - The North Room says 20 booths but has 22; the plan's legend totals don't
//     add up. We keep the 66 booths drawn (24 × 4×3 m, 38 × 3×3 m, 4 × 6×6 m).
//   - The entrance booths are labelled Booth 1, 1, 2, 3; we call them M-1 to M-4.
//   - No door is drawn between the Main Entrance and the Registration Foyer, or
//     to the outside: central openings are assumed. Each room's `doors` below
//     say where they are, so moving one is a one-line change.

export const MAP_W = 200;
export const MAP_H = 114;
export const METRES_PER_UNIT = 0.304;
/** Average walking speed used for "min walk". */
export const WALK_SPEED_MPS = 1.2;

export type Point = [x: number, y: number];
export type Rect = [x: number, y: number, w: number, h: number];
export type Side = "t" | "b" | "l" | "r";

/** A gap in one wall of a room, from `a` to `b` along that wall (map units). */
export interface Door {
  side: Side;
  a: number;
  b: number;
}

/** Plan pixels (x1, y1, x2, y2) to a map rect. */
const R = (x1: number, y1: number, x2: number, y2: number): Rect => [x1 / 10, y1 / 10, (x2 - x1) / 10, (y2 - y1) / 10];

// ---------- rooms and areas ----------

export type ZoneId = "amph" | "north" | "foyer" | "regf" | "entr" | "west" | "east";

export interface Zone {
  id: ZoneId;
  code: string;
  name: string;
  /** Used in directions: "Go through the doorway into the North Room". */
  into: string;
  cat: string;
  rect: Rect;
  doors: Door[];
  /** Where a route to this room ends. */
  anchor: Point;
  fill: "floor" | "hall";
}

export const ZONES: Zone[] = [
  { id: "amph", code: "AMP", name: "Conference Amphitheatre", into: "into the Conference Amphitheatre", cat: "Plenary sessions · enter through the North Room", rect: R(581, 18, 1305, 137), doors: [{ side: "b", a: 88, b: 100 }], anchor: [94, 11], fill: "hall" },
  { id: "north", code: "NR", name: "North Room", into: "into the North Room", cat: "Exhibition room · 247 sqm", rect: R(582, 137, 1307, 418), doors: [{ side: "t", a: 88, b: 100 }, { side: "b", a: 89.7, b: 99.3 }], anchor: [94, 26], fill: "floor" },
  { id: "foyer", code: "MF", name: "Main Foyer & Networking Area", into: "into the Main Foyer", cat: "Networking · connects all exhibition rooms", rect: R(626, 420, 1262, 677), doors: [{ side: "t", a: 89.7, b: 99.3 }, { side: "l", a: 55, b: 73.8 }, { side: "r", a: 57.3, b: 76 }, { side: "b", a: 86, b: 104.8 }], anchor: [94, 50], fill: "floor" },
  { id: "regf", code: "RF", name: "Registration Foyer", into: "into the Registration Foyer", cat: "Badge pickup · approx. 90–100 sqm", rect: R(626, 677, 1262, 872), doors: [{ side: "t", a: 86, b: 104.8 }, { side: "b", a: 80, b: 109 }], anchor: [94, 76], fill: "floor" },
  { id: "entr", code: "ME", name: "Main Entrance hall", into: "into the Main Entrance hall", cat: "Entrance · 4 feature booths", rect: R(625, 872, 1262, 1093), doors: [{ side: "t", a: 80, b: 109 }, { side: "b", a: 86, b: 102 }], anchor: [94, 96], fill: "hall" },
  { id: "west", code: "WR", name: "West Room", into: "into the West Room", cat: "Exhibition room · 247 sqm", rect: R(5, 435, 625, 866), doors: [{ side: "r", a: 55, b: 73.8 }], anchor: [56, 64], fill: "floor" },
  { id: "east", code: "ER", name: "East Room", into: "into the East Room", cat: "Exhibition room · 247 sqm", rect: R(1262, 437, 1983, 869), doors: [{ side: "l", a: 57.3, b: 76 }], anchor: [135, 64], fill: "floor" },
];

/** The building's way in, outside the Main Entrance hall. The default start. */
export const ENTRANCE = { id: "entrance", code: "IN", name: "Main entrance door", cat: "Entrance", anchor: [94, 108] as Point };

// ---------- facilities ----------

export type FacilityCategory = "registration" | "toilets" | "catering" | "exit" | "prayer" | "media" | "info" | "medical";

export interface Facility {
  id: string;
  code: string;
  name: string;
  category: FacilityCategory;
  /** Shown under the name in search, e.g. the room it is in. */
  area: string;
  anchor: Point;
  /** Desks and counters drawn on the plan. Without one, the map shows an icon at the anchor. */
  rect?: Rect;
  /** Text written along a drawn rect. */
  mapLabel?: string;
}

// Toilets, catering, exits, the prayer room and the media area aren't on the
// draft plan yet. Add them here when confirmed: they appear on the map, in
// search and in the "You are at" list on their own, e.g.
//   { id: "wc-west", code: "WC1", name: "Toilets (west)", category: "toilets", area: "West Room", anchor: [8, 60] },
export const FACILITIES: Facility[] = [
  { id: "regW", code: "RG1", name: "Registration desk (west)", category: "registration", area: "Registration Foyer", rect: R(684, 724, 744, 843), anchor: [76.5, 78.4], mapLabel: "REGISTRATION" },
  { id: "regE", code: "RG2", name: "Registration desk (east)", category: "registration", area: "Registration Foyer", rect: R(1141, 730, 1201, 849), anchor: [112, 79], mapLabel: "REGISTRATION" },
];

// ---------- booths ----------

export type BoothSize = "s" | "l" | "x";

export const BOOTH_SIZE_LABEL: Record<BoothSize, string> = { s: "3×3 m", l: "4×3 m", x: "6×6 m" };

const BOOTH_ROOM: Record<string, ZoneId> = { N: "north", W: "west", E: "east", M: "entr" };

export interface Booth {
  code: string;
  rect: Rect;
  size: BoothSize;
  /** The side facing the aisle, where routes arrive. */
  face: Side;
  anchor: Point;
  room: ZoneId;
  note?: string;
}

// code, plan rect (px), side facing the aisle, optional note
const BOOTH_PLAN: [string, number, number, number, number, Side, string?][] = [
  ["N-S6", 629, 144, 678, 175, "b"], ["N-S7", 683, 145, 731, 176, "b"], ["N-L3", 737, 145, 809, 183, "b"], ["N-L4", 815, 145, 887, 184, "b"],
  ["N-L5", 1002, 142, 1075, 182, "b"], ["N-L6", 1079, 142, 1151, 181, "b"], ["N-S8", 1157, 143, 1205, 175, "b"], ["N-S9", 1212, 143, 1260, 175, "b"],
  ["N-L2", 614, 189, 656, 260, "r"], ["N-L1", 613, 282, 655, 352, "r"], ["N-L7", 1229, 196, 1270, 268, "l"], ["N-L8", 1233, 280, 1274, 351, "l"],
  ["N-S5", 608, 382, 656, 415, "t"], ["N-S4", 662, 382, 709, 415, "t"], ["N-S3", 716, 382, 763, 415, "t"], ["N-S2", 770, 382, 818, 415, "t"], ["N-S1", 824, 382, 872, 415, "t"],
  ["N-S14", 1014, 380, 1062, 413, "t"], ["N-S13", 1069, 380, 1117, 413, "t"], ["N-S12", 1124, 380, 1172, 413, "t"], ["N-S11", 1179, 380, 1227, 413, "t"], ["N-S10", 1233, 380, 1281, 413, "t"],
  ["W-S10", 55, 452, 103, 483, "b"], ["W-S11", 107, 452, 153, 483, "b"], ["W-S12", 158, 452, 204, 483, "b"], ["W-L5", 211, 449, 283, 488, "b"],
  ["W-L6", 331, 443, 403, 483, "b"], ["W-L7", 413, 443, 485, 483, "b"], ["W-L8", 496, 443, 568, 483, "b"],
  ["W-S9", 53, 509, 102, 543, "r"], ["W-S8", 53, 556, 102, 590, "r"], ["W-S7", 53, 603, 102, 637, "r"], ["W-S6", 53, 647, 102, 681, "r"], ["W-S5", 53, 695, 102, 729, "r"], ["W-S4", 55, 744, 103, 777, "r"],
  ["W-S3", 54, 818, 101, 853, "t"], ["W-S2", 106, 818, 153, 853, "t"], ["W-S1", 157, 818, 204, 853, "t"], ["W-L4", 211, 815, 283, 853, "t"],
  ["W-L3", 331, 815, 403, 856, "t"], ["W-L2", 413, 815, 485, 856, "t"], ["W-L1", 492, 815, 564, 856, "t"],
  ["E-L8", 1351, 451, 1423, 490, "b"], ["E-L7", 1441, 452, 1513, 492, "b"], ["E-L6", 1531, 453, 1603, 493, "b"], ["E-L5", 1665, 450, 1737, 490, "b"],
  ["E-S12", 1755, 464, 1803, 497, "b"], ["E-S11", 1810, 464, 1858, 497, "b"], ["E-S10", 1865, 462, 1913, 495, "b"],
  ["E-S9", 1923, 496, 1955, 543, "l"], ["E-S8", 1923, 551, 1955, 598, "l"], ["E-S7", 1923, 606, 1955, 653, "l"], ["E-S6", 1923, 662, 1955, 709, "l"], ["E-S5", 1923, 716, 1955, 763, "l"], ["E-S4", 1923, 771, 1955, 818, "l"],
  ["E-L1", 1351, 816, 1423, 855, "t"], ["E-L2", 1441, 816, 1513, 855, "t"], ["E-L3", 1531, 815, 1603, 854, "t"], ["E-L4", 1671, 814, 1743, 853, "t"],
  ["E-S1", 1755, 830, 1803, 863, "t"], ["E-S2", 1810, 830, 1858, 863, "t"], ["E-S3", 1865, 830, 1913, 863, "t"],
  ["M-1", 645, 894, 758, 973, "r", "Plan label: Booth 1"], ["M-2", 1106, 894, 1219, 973, "l", "Plan label: Booth 1"],
  ["M-3", 645, 996, 758, 1075, "r", "Plan label: Booth 2"], ["M-4", 1106, 996, 1219, 1075, "l", "Plan label: Booth 3"],
];

export const BOOTHS: Booth[] = BOOTH_PLAN.map(([code, x1, y1, x2, y2, face, note]) => {
  const rect = R(x1, y1, x2, y2);
  const [x, y, w, h] = rect;
  const size: BoothSize = code[0] === "M" ? "x" : code[2] === "S" ? "s" : "l";
  const off = 1.4; // stand just in front of the booth
  const anchor: Point =
    face === "b" ? [x + w / 2, y + h + off] : face === "t" ? [x + w / 2, y - off] : face === "r" ? [x + w + off, y + h / 2] : [x - off, y + h / 2];
  return { code, rect, size, face, anchor, room: BOOTH_ROOM[code[0]], note };
});

// ---------- QR points ----------

export interface QrPoint {
  id: string;
  /** The area named on the printed sticker: "You are here: Main Foyer". */
  area: string;
  anchor: Point;
}

// One printed sticker per point (/admin/venue-stickers); each links to /venue?from=<id>.
export const QR_POINTS: QrPoint[] = [
  { id: "Q1", area: "Registration Foyer", anchor: [94, 84.5] },
  { id: "Q2", area: "Main Foyer", anchor: [94, 61] },
  { id: "Q3", area: "North Room", anchor: [94, 30] },
  { id: "Q4", area: "Amphitheatre door", anchor: [94, 16.6] },
  { id: "Q5", area: "West Room", anchor: [42, 66] },
  { id: "Q6", area: "East Room", anchor: [152, 66] },
];

// ---------- obstacles (not destinations) ----------

export const AC_UNITS: Rect[] = (
  [
    [583, 145, 606, 180], [583, 345, 606, 380], [1283, 143, 1306, 180], [1283, 340, 1306, 377],
    [9, 478, 32, 515], [297, 440, 320, 477], [600, 437, 623, 476], [9, 789, 32, 826], [297, 828, 320, 865], [600, 827, 623, 864],
    [1283, 437, 1306, 476], [1624, 437, 1647, 476], [1955, 441, 1978, 479], [1283, 826, 1306, 865], [1637, 827, 1660, 866], [1955, 823, 1978, 861],
  ] as const
).map(([x1, y1, x2, y2]) => R(x1, y1, x2, y2));

/** Cocktail tables, from their centres on the plan. */
export const TABLES: Rect[] = (
  [
    [815, 253], [1054, 245], [815, 338], [1054, 338],
    [703, 519], [798, 575], [940, 555], [1100, 569], [1183, 516], [698, 630], [1176, 635],
    [194, 583], [364, 610], [364, 707], [194, 737], [1801, 583], [1601, 610], [1601, 707], [1809, 737],
  ] as const
).map(([cx, cy]): Rect => [cx / 10 - 2.3, cy / 10 - 1.7, 4.6, 3.4]);

/** Space behind booth rows (against the wall): not walkable. */
export const BOOTH_BACKING: Rect[] = [
  [58.2, 13.7, 29.8, 1.3], [100, 13.7, 30.7, 1.3], [58.2, 13.7, 3.3, 28.1], [127.3, 13.7, 3.4, 28.1],
  [0.5, 43.5, 62, 1.6], [0.5, 43.5, 5.0, 43.1], [0.5, 85.2, 62, 1.4],
  [126.2, 43.7, 72.1, 1.6], [195.2, 43.7, 3.1, 43.2], [126.2, 86.0, 72.1, 0.9],
  [62.5, 87.2, 2.2, 22.1], [121.7, 87.2, 4.5, 22.1],
];

// ---------- labels drawn on the map ----------

export interface MapLabel {
  x: number;
  y: number;
  text: string;
  size: number;
  sub?: boolean;
  rotate?: number;
}

export const MAP_LABELS: MapLabel[] = [
  { x: 94.3, y: 4.4, text: "CONFERENCE AMPHITHEATRE", size: 1.7 },
  { x: 94.3, y: 7.3, text: "Enter through the North Room", size: 1.05, sub: true },
  { x: 94.3, y: 21, text: "NORTH ROOM", size: 1.9 },
  { x: 94.3, y: 23.5, text: "247 sqm", size: 1.1, sub: true },
  { x: 77, y: 46, text: "MAIN FOYER", size: 1.6 },
  { x: 77, y: 48.4, text: "Networking area", size: 1.05, sub: true },
  { x: 84.3, y: 75.6, text: "REGISTRATION", size: 1.4 },
  { x: 84.3, y: 77.6, text: "FOYER", size: 1.4 },
  { x: 84.3, y: 79.8, text: "Approx. 90–100 sqm", size: 0.95, sub: true },
  { x: 84.5, y: 98.4, text: "MAIN", size: 1.4 },
  { x: 84.5, y: 100.4, text: "ENTRANCE", size: 1.4 },
  { x: 49.7, y: 64, text: "WEST ROOM", size: 1.9, rotate: -90 },
  { x: 46.6, y: 64, text: "247 sqm", size: 1.1, sub: true, rotate: -90 },
  { x: 143.3, y: 64, text: "EAST ROOM", size: 1.9, rotate: -90 },
  { x: 146.4, y: 64, text: "247 sqm", size: 1.1, sub: true, rotate: -90 },
];
