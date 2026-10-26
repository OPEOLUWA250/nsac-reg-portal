import {
  AC_UNITS,
  BOOTHS,
  BOOTH_BACKING,
  FACILITIES,
  MAP_H,
  MAP_W,
  TABLES,
  ZONES,
  type Door,
  type Point,
  type Rect,
} from "@/lib/venue/data";

// Walking routes on a grid of 0.5-unit cells: A* with a penalty for hugging
// walls and booths, then line-of-sight smoothing so the line cuts straight
// across open floor. Pure functions, no DOM; the grid is built once.

export const CELL = 0.5;
export const COLS = MAP_W / CELL;
export const ROWS = MAP_H / CELL;
const N = COLS * ROWS;

export interface Grid {
  /** 1 where nobody can walk. */
  blocked: Uint8Array;
  /** Distance to the nearest obstacle, in cells (Chebyshev, capped at 255). */
  clear: Uint8Array;
}

export const idx = (i: number, j: number) => j * COLS + i;
export const toCell = ([x, y]: Point): [number, number] => [
  Math.min(COLS - 1, Math.max(0, Math.floor(x / CELL))),
  Math.min(ROWS - 1, Math.max(0, Math.floor(y / CELL))),
];
export const cellCenter = (k: number): Point => [((k % COLS) + 0.5) * CELL, (((k / COLS) | 0) + 0.5) * CELL];
export const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Wall strips [x, y, w, h] around a room, with gaps for its doors. */
export function wallsOf(rect: Rect, doors: Door[] = []): Rect[] {
  const [x, y, w, h] = rect;
  const t = CELL;
  const out: Rect[] = [];
  const cut = (a0: number, a1: number, side: Door["side"]) => {
    const ds = doors.filter((d) => d.side === side).sort((p, q) => p.a - q.a);
    let s = a0;
    const seg: [number, number][] = [];
    for (const d of ds) {
      if (d.a > s) seg.push([s, d.a]);
      s = Math.max(s, d.b);
    }
    if (a1 > s) seg.push([s, a1]);
    return seg;
  };
  cut(x, x + w, "t").forEach(([a, b]) => out.push([a, y, b - a, t]));
  cut(x, x + w, "b").forEach(([a, b]) => out.push([a, y + h - t, b - a, t]));
  cut(y, y + h, "l").forEach(([a, b]) => out.push([x, a, t, b - a]));
  cut(y, y + h, "r").forEach(([a, b]) => out.push([x + w - t, a, t, b - a]));
  return out;
}

export function buildGrid(): Grid {
  // Everything starts blocked; the rooms are opened up, then walls, furniture
  // and booths are blocked again. Cells count by their centres.
  const blocked = new Uint8Array(N).fill(1);
  const fill = ([x, y, w, h]: Rect, v: 0 | 1) => {
    const j0 = Math.max(0, Math.floor(y / CELL)), j1 = Math.min(ROWS - 1, Math.ceil((y + h) / CELL));
    const i0 = Math.max(0, Math.floor(x / CELL)), i1 = Math.min(COLS - 1, Math.ceil((x + w) / CELL));
    for (let j = j0; j <= j1; j++) {
      const cy = (j + 0.5) * CELL;
      if (cy < y || cy >= y + h) continue;
      for (let i = i0; i <= i1; i++) {
        const cx = (i + 0.5) * CELL;
        if (cx >= x && cx < x + w) blocked[j * COLS + i] = v;
      }
    }
  };
  const blockRect = (r: Rect) => fill(r, 1);

  ZONES.forEach((z) => fill(z.rect, 0));
  ZONES.forEach((z) => wallsOf(z.rect, z.doors).forEach(blockRect));
  [...AC_UNITS, ...TABLES, ...BOOTH_BACKING].forEach(blockRect);
  FACILITIES.forEach((f) => f.rect && blockRect(f.rect));
  BOOTHS.forEach(({ rect: [x, y, w, h] }) => blockRect([x - 0.3, y - 0.3, w + 0.6, h + 0.6]));

  // Clearance: breadth-first from every obstacle. Steps all cost 1, so each
  // cell is reached once, at its final distance.
  const clear = new Uint8Array(N).fill(255);
  const q = new Int32Array(N);
  let tail = 0;
  for (let k = 0; k < N; k++)
    if (blocked[k]) {
      clear[k] = 0;
      q[tail++] = k;
    }
  for (let h = 0; h < tail; h++) {
    const k = q[h], i = k % COLS, j = (k / COLS) | 0, d = clear[k] + 1;
    for (let nj = Math.max(0, j - 1); nj <= Math.min(ROWS - 1, j + 1); nj++)
      for (let ni = Math.max(0, i - 1); ni <= Math.min(COLS - 1, i + 1); ni++) {
        const nk = nj * COLS + ni;
        if (clear[nk] > d) {
          clear[nk] = d;
          q[tail++] = nk;
        }
      }
  }
  return { blocked, clear };
}

// Built once. In the browser a Web Worker builds it after the page loads
// (grid.worker.ts, via setGrid), so the first tap doesn't wait; anything that
// needs it sooner builds it here instead.
let grid: Grid | null = null;
export function getGrid(): Grid {
  return (grid ??= buildGrid());
}
export function hasGrid(): boolean {
  return grid !== null;
}
export function setGrid(g: Grid): void {
  grid ??= g;
}

/** The nearest walkable cell to a point. */
export function snap(pt: Point): number {
  const { blocked } = getGrid();
  const [i, j] = toCell(pt);
  const k = idx(i, j);
  if (!blocked[k]) return k;
  const seen = new Uint8Array(N);
  const q = [k];
  seen[k] = 1;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], ci = c % COLS, cj = (c / COLS) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS) continue;
      const nk = idx(ni, nj);
      if (seen[nk]) continue;
      seen[nk] = 1;
      if (!blocked[nk]) return nk;
      q.push(nk);
    }
  }
  return k;
}

/** Cells from s to g (inclusive), or null when g can't be reached. */
export function astar(s: number, g: number): number[] | null {
  const { blocked, clear } = getGrid();
  const gS = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);

  const heap: [number, number][] = [];
  const push = (f: number, k: number) => {
    heap.push([f, k]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  const gi = g % COLS, gj = (g / COLS) | 0;
  const hfn = (k: number) => {
    const dx = Math.abs((k % COLS) - gi), dy = Math.abs(((k / COLS) | 0) - gj);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  // Keep a little away from walls and booths where there's room to.
  const pen = (k: number) => (clear[k] >= 6 ? 0 : (6 - clear[k]) * 0.3);

  gS[s] = 0;
  push(hfn(s), s);
  while (heap.length) {
    const [, k] = pop();
    if (closed[k]) continue;
    if (k === g) break;
    closed[k] = 1;
    const i = k % COLS, j = (k / COLS) | 0;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS) continue;
        const nk = idx(ni, nj);
        if (blocked[nk] || closed[nk]) continue;
        // No cutting corners diagonally.
        if (di && dj && (blocked[idx(i + di, j)] || blocked[idx(i, j + dj)])) continue;
        const ng = gS[k] + (di && dj ? Math.SQRT2 : 1) + pen(nk);
        if (ng < gS[nk]) {
          gS[nk] = ng;
          came[nk] = k;
          push(ng + hfn(nk), nk);
        }
      }
  }
  if (came[g] < 0 && g !== s) return null;
  const out: number[] = [];
  for (let k = g; k !== -1; k = came[k]) {
    out.push(k);
    if (k === s) break;
  }
  return out.reverse();
}

/** Clear straight line between a and b, allowing a tight squeeze only near the route's ends A and B. */
function lineOfSight(a: Point, b: Point, A: Point, B: Point): boolean {
  const { blocked, clear } = getGrid();
  const n = Math.ceil(dist(a, b) / 0.2);
  for (let s = 0; s <= n; s++) {
    const t = n ? s / n : 0;
    const p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const k = idx(...toCell(p));
    if (blocked[k]) return false;
    if (clear[k] < 3 && dist(p, A) > 1.6 && dist(p, B) > 1.6) return false;
  }
  return true;
}

/** The walking route as a polyline, or null when there is none. */
export function route(fromPt: Point, toPt: Point): Point[] | null {
  const { blocked } = getGrid();
  const s = snap(fromPt), g = snap(toPt);
  const cells = astar(s, g);
  if (!cells) return null;
  const pts = cells.map(cellCenter);
  pts[0] = [fromPt[0], fromPt[1]];
  pts[pts.length - 1] = [toPt[0], toPt[1]];
  if (blocked[idx(...toCell(fromPt))]) pts[0] = cellCenter(s);
  if (blocked[idx(...toCell(toPt))]) pts[pts.length - 1] = cellCenter(g);
  const A = pts[0], B = pts[pts.length - 1];
  const out: Point[] = [A];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !lineOfSight(pts[i], pts[j], A, B)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

export function pathLength(pts: Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}
