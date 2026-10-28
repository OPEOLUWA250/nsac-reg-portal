import { describe, expect, it } from "vitest";
import { BOOTHS, ENTRANCE, QR_POINTS, type Point } from "@/lib/venue/data";
import { buildPlaces } from "@/lib/venue/places";
import { COLS, ROWS, dist, getGrid, idx, route, snap, toCell } from "@/lib/venue/pathfinding";

const places = buildPlaces();
const targets = places.filter((p) => p.kind === "booth" || p.kind === "room" || p.kind === "facility");

// Cells reachable from a start cell, moving up/down/left/right (a subset of
// the moves A* may make, so anything found here A* can reach too).
function reachable(start: number): Uint8Array {
  const { blocked } = getGrid();
  const seen = new Uint8Array(COLS * ROWS);
  const q = [start];
  seen[start] = 1;
  for (let h = 0; h < q.length; h++) {
    const k = q[h], i = k % COLS, j = (k / COLS) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS) continue;
      const nk = idx(ni, nj);
      if (seen[nk] || blocked[nk]) continue;
      seen[nk] = 1;
      q.push(nk);
    }
  }
  return seen;
}

describe("venue pathfinding", () => {
  it("has the 66 booths drawn on the plan", () => {
    expect(BOOTHS).toHaveLength(66);
    expect(BOOTHS.filter((b) => b.size === "l")).toHaveLength(24);
    expect(BOOTHS.filter((b) => b.size === "s")).toHaveLength(38);
    expect(BOOTHS.filter((b) => b.size === "x")).toHaveLength(4);
  });

  it.each([ENTRANCE, ...QR_POINTS.map((q) => ({ id: q.id, anchor: q.anchor }))])(
    "reaches every booth, room and facility from $id",
    ({ anchor }) => {
      const seen = reachable(snap(anchor));
      const unreachable = targets.filter((t) => !seen[snap(t.anchor)]).map((t) => t.id);
      expect(unreachable).toEqual([]);
    }
  );

  it("routes from the entrance to every place without crossing a blocked cell", () => {
    const { blocked } = getGrid();
    const problems: string[] = [];
    for (const t of targets) {
      const pts = route(ENTRANCE.anchor, t.anchor);
      if (!pts) {
        problems.push(`${t.id}: no route`);
        continue;
      }
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const n = Math.max(1, Math.ceil(dist(a, b) / 0.1));
        for (let s = 0; s <= n; s++) {
          const p: Point = [a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n];
          if (blocked[idx(...toCell(p))]) problems.push(`${t.id}: blocked at ${p.map((v) => v.toFixed(1))}`);
        }
      }
    }
    expect(problems).toEqual([]);
  }, 30_000);
});
