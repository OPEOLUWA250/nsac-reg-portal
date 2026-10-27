import { describe, expect, it } from "vitest";
import { fitLabel, LINE_HEIGHT, textWidth } from "@/lib/venue/label-fit";

const fits = (r: NonNullable<ReturnType<typeof fitLabel>>, width: number, height: number) =>
  r.lines.every((l) => textWidth(l) * r.size <= width + 1e-9) && r.lines.length * r.size * LINE_HEIGHT <= height + 1e-9;

describe("fitLabel", () => {
  it("uses the largest size for a short name", () => {
    expect(fitLabel("SIA", 4, 2, 1.2)).toEqual({ size: 1.2, lines: ["SIA"], cut: false });
  });

  it("wraps a longer name instead of hiding it", () => {
    const r = fitLabel("Sahel Orbital Systems", 4, 2, 1.2)!;
    expect(r.cut).toBe(false);
    expect(r.lines.length).toBeGreaterThan(1);
    expect(r.lines.join(" ")).toBe("Sahel Orbital Systems");
    expect(fits(r, 4, 2)).toBe(true);
  });

  it("cuts a name too long for the booth, ending in …", () => {
    const r = fitLabel("The Pan-African Association of Satellite Ground Station Operators and Friends", 3, 1.2, 1.2)!;
    expect(r.cut).toBe(true);
    expect(r.size).toBe(0.5);
    expect(r.lines.at(-1)).toMatch(/…$/);
    expect(fits(r, 3, 1.2)).toBe(true);
  });

  it("gives up when nothing readable fits", () => {
    expect(fitLabel("Acme", 0.5, 2, 1.2)).toBeNull();
    expect(fitLabel("   ", 4, 2, 1.2)).toBeNull();
  });
});
