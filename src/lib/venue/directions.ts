import { METRES_PER_UNIT, ZONES, type Point, type Rect, type Zone } from "@/lib/venue/data";
import { nameInText, type Place } from "@/lib/venue/places";

// Turn-by-turn directions from a route polyline: turns named after a nearby
// booth or desk, "go through the doorway into …" where the route changes
// room, and which side the booth is on when you arrive.

export type StepType = "start" | "left" | "right" | "around" | "door" | "arrive";

export interface Step {
  type: StepType;
  text: string;
  /** Distance along the route where the step starts (map units). */
  at: number;
  /** Walking distance until the next step, in metres. */
  distanceM: number;
  /** Where on the map the step starts. */
  point: Point;
}

/** Where a route starts: a place, or the spot someone tapped on the map. */
export type RouteEnd = Pick<Place, "id" | "kind" | "name" | "code" | "assigned"> & { rect?: Rect };

function rectDist(pt: Point, r: Rect) {
  const dx = Math.max(r[0] - pt[0], 0, pt[0] - (r[0] + r[2]));
  const dy = Math.max(r[1] - pt[1], 0, pt[1] - (r[1] + r[3]));
  return Math.hypot(dx, dy);
}

function landmark(pt: Point, places: Place[], exclude: Set<string>): Place | null {
  let best: Place | null = null;
  let bd = 4.5;
  for (const p of places) {
    if (!p.rect || p.kind === "room" || exclude.has(p.id)) continue;
    const d = rectDist(pt, p.rect);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

export function zoneAt(p: Point): Zone | null {
  return ZONES.find(({ rect: [x, y, w, h] }) => p[0] >= x && p[0] <= x + w && p[1] >= y && p[1] <= y + h) ?? null;
}

// Map y grows downwards, so north is up the screen.
const cardinal = (v: Point) =>
  ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"][
    (((Math.round(Math.atan2(v[1], v[0]) / (Math.PI / 4)) % 8) + 8) % 8)
  ];

interface Event {
  d: number;
  type: StepType;
  text: string;
  point: Point;
  /** A doorway is already mentioned in this step. */
  into?: boolean;
}

export function buildSteps(pts: Point[], from: RouteEnd | null, to: RouteEnd, places: Place[]): Step[] {
  const exclude = new Set([from?.id ?? "", to.id]);
  const segs: { v: Point; len: number; at: Point; end: Point }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const v: Point = [pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]];
    segs.push({ v, len: Math.hypot(...v), at: pts[i], end: pts[i + 1] });
  }
  if (!segs.length) return [];
  const cum = [0];
  segs.forEach((s) => cum.push(cum[cum.length - 1] + s.len));
  const total = cum[cum.length - 1];

  const ev: Event[] = [{ d: 0, type: "start", text: `Head ${cardinal(segs[0].v)}`, point: segs[0].at }];
  for (let i = 1; i < segs.length; i++) {
    const a = segs[i - 1].v, b = segs[i].v;
    const ang = (Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]) * 180) / Math.PI;
    const abs = Math.abs(ang);
    if (abs < 25 || segs[i].len < 1.5) continue;
    const side = ang > 0 ? "right" : "left";
    const verb = abs < 60 ? `Bear ${side}` : abs < 140 ? `Turn ${side}` : "Turn around";
    const lm = landmark(segs[i].at, places, exclude);
    ev.push({ d: cum[i], type: abs < 140 ? side : "around", text: verb + (lm ? ` at ${nameInText(lm)}` : ""), point: segs[i].at });
  }

  // Room changes along the path. Close to a turn, the doorway joins that step.
  let prev = zoneAt(pts[0]);
  segs.forEach((s, i) => {
    const n = Math.max(1, Math.ceil(s.len / 0.25));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const p: Point = [s.at[0] + s.v[0] * t, s.at[1] + s.v[1] * t];
      const z = zoneAt(p);
      if (z && z !== prev) {
        if (prev) {
          const d = cum[i] + s.len * t;
          const near = ev.find((e) => e.type !== "door" && Math.abs(e.d - d) < 4 && e.d > 0);
          if (near && !near.into) {
            near.text += `, then go through the doorway ${z.into}`;
            near.into = true;
          } else ev.push({ d, type: "door", text: `Go through the doorway ${z.into}`, point: p });
        }
        prev = z;
      }
    }
  });
  ev.sort((a, b) => a.d - b.d);

  const steps: Step[] = ev.map((e, i) => ({
    type: e.type,
    text: e.text,
    at: e.d,
    distanceM: ((i < ev.length - 1 ? ev[i + 1].d : total) - e.d) * METRES_PER_UNIT,
    point: e.point,
  }));

  // Which side the booth is on, from the last stretch of the walk.
  const last = segs[segs.length - 1];
  let side = "";
  if (to.kind === "booth" && to.rect) {
    const c: Point = [to.rect[0] + to.rect[2] / 2, to.rect[1] + to.rect[3] / 2];
    const v: Point = [c[0] - last.end[0], c[1] - last.end[1]];
    const cr = last.v[0] * v[1] - last.v[1] * v[0];
    const dot = last.v[0] * v[0] + last.v[1] * v[1];
    side = Math.abs(cr) > Math.abs(dot) * 0.4 ? (cr > 0 ? " on your right" : " on your left") : " ahead of you";
  }
  steps.push({ type: "arrive", text: `Arrive at ${nameInText(to)}${side}`, at: total, distanceM: 0, point: last.end });
  return steps;
}
