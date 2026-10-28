import { expect, it } from "vitest";
import { bucketByDay, countBy, niceCeil } from "./analytics";

const now = new Date(2026, 9, 28, 15, 0); // 28 Oct 2026, afternoon
const at = (month: number, day: number, hour = 10) => new Date(2026, month, day, hour).toISOString();

it("counts per day over the last N days, today included", () => {
  const s = bucketByDay([{ at: at(9, 28) }, { at: at(9, 28, 23) }, { at: at(9, 26) }, { at: at(8, 1) }], 7, now);
  expect(s.weekly).toBe(false);
  expect(s.buckets).toHaveLength(7);
  expect(s.buckets[0].short).toBe("22 Oct");
  expect(s.buckets.map((b) => b.value)).toEqual([0, 0, 0, 0, 1, 0, 2]);
  expect(s.total).toBe(3); // the September point is outside the window
});

it("adds values when given, and skips points without a date", () => {
  const s = bucketByDay([{ at: at(9, 27), value: 250 }, { at: at(9, 27), value: 100 }, { at: null, value: 999 }], 3, now);
  expect(s.buckets.map((b) => b.value)).toEqual([0, 350, 0]);
});

it("groups long stretches by week, starting Monday", () => {
  const s = bucketByDay([{ at: at(0, 7) }, { at: at(9, 28) }], "all", now);
  expect(s.weekly).toBe(true);
  expect(s.buckets[0].label).toBe("Week of 5 Jan"); // 7 Jan 2026 is a Wednesday
  expect(s.buckets.at(-1)?.value).toBe(1);
  expect(s.total).toBe(2);
});

it("rounds chart scales up to a readable number", () => {
  expect([0, 1, 3, 7, 12, 26, 480, 1001].map(niceCeil)).toEqual([1, 1, 5, 10, 20, 50, 500, 2000]);
});

it("counts by key, biggest first, ignoring blanks", () => {
  expect(countBy(["b", "a", "b", " ", "c", "a", "b"], (x) => x)).toEqual([["b", 3], ["a", 2], ["c", 1]]);
});
