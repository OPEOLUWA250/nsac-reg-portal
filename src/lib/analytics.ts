// Shared sums for the Analytics page (/admin/analytics): counts over time and
// round numbers for chart scales. No React, so they can be tested on their own.

const DAY_MS = 24 * 3600_000;

export interface Bucket {
  /** "12 Oct", or "Week of 12 Oct" when grouped by week. */
  label: string;
  /** Always the bare date, for the axis. */
  short: string;
  value: number;
}

export interface Series {
  buckets: Bucket[];
  weekly: boolean;
  total: number;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function shortDate(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Adds up `points` per day over the last `days` days up to `now` (local time),
 * or since the earliest point when `days` is "all". Stretches longer than 120
 * days are grouped by week, starting Monday, so the bars stay readable.
 */
export function bucketByDay(points: { at: string | null; value?: number }[], days: number | "all", now = new Date()): Series {
  const today = startOfDay(now);
  const earliest = points.reduce((min, p) => (p.at ? Math.min(min, new Date(p.at).getTime()) : min), today.getTime());
  const start = days === "all" ? startOfDay(new Date(earliest)) : new Date(today.getFullYear(), today.getMonth(), today.getDate() - days + 1);
  const weekly = Math.round((today.getTime() - start.getTime()) / DAY_MS) + 1 > 120;
  const step = weekly ? 7 : 1;
  const first = weekly ? new Date(start.getFullYear(), start.getMonth(), start.getDate() - ((start.getDay() + 6) % 7)) : start;
  // Whole days between two midnights; rounding absorbs daylight-saving hours.
  const index = (d: Date) => Math.floor(Math.round((d.getTime() - first.getTime()) / DAY_MS) / step);
  const buckets: Bucket[] = Array.from({ length: index(today) + 1 }, (_, i) => {
    const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i * step);
    return { label: weekly ? `Week of ${shortDate(d)}` : shortDate(d), short: shortDate(d), value: 0 };
  });
  for (const p of points) {
    if (!p.at) continue;
    const day = startOfDay(new Date(p.at));
    if (day < start) continue;
    const bucket = buckets[index(day)];
    if (bucket) bucket.value += p.value ?? 1;
  }
  return { buckets, weekly, total: buckets.reduce((s, b) => s + b.value, 0) };
}

/** A round number at or above `v`, for the top of a chart's scale. */
export function niceCeil(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((m) => m * pow >= v - 1e-9) ?? 10) * pow;
}

/** Rows of [label, count], biggest first, then A to Z. Empty values are left out. */
export function countBy<T>(list: T[], key: (item: T) => string | null | undefined): [string, number][] {
  const map = new Map<string, number>();
  for (const item of list) {
    const k = key(item)?.trim();
    if (k) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
}
