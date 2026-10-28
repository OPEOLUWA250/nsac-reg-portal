import { describe, expect, it } from "vitest";
import { buildPlaces } from "@/lib/venue/places";
import { DEFAULT_FROM, parseVenueQuery, venueQuery } from "@/lib/venue/params";

const places = buildPlaces();
const byId = (id: string) => places.find((p) => p.id === id)!;

describe("venue URL", () => {
  it("reads a QR sticker's start", () => {
    expect(parseVenueQuery({ from: "Q3" }, places)).toEqual({ from: "Q3", to: null });
  });

  it("ignores case and the hyphen in booth codes", () => {
    expect(parseVenueQuery({ to: "ws4" }, places).to).toBe("W-S4");
    expect(parseVenueQuery({ to: "W-S4" }, places).to).toBe("W-S4");
    expect(parseVenueQuery({ to: "e l2" }, places).to).toBe("E-L2");
    expect(parseVenueQuery({ from: "q1", to: "n-s10" }, places)).toEqual({ from: "Q1", to: "N-S10" });
  });

  it("tells W-S1 from W-S10", () => {
    expect(parseVenueQuery({ to: "ws1" }, places).to).toBe("W-S1");
    expect(parseVenueQuery({ to: "ws10" }, places).to).toBe("W-S10");
  });

  it("accepts rooms and desks by code", () => {
    expect(parseVenueQuery({ to: "NR" }, places).to).toBe("north");
    expect(parseVenueQuery({ to: "rg2" }, places).to).toBe("regE");
  });

  it("falls back to the defaults for unknown or missing codes", () => {
    expect(parseVenueQuery({}, places)).toEqual({ from: DEFAULT_FROM, to: null });
    expect(parseVenueQuery({ from: "Z9", to: "W-S99" }, places)).toEqual({ from: DEFAULT_FROM, to: null });
    expect(parseVenueQuery({ from: "", to: "--" }, places)).toEqual({ from: DEFAULT_FROM, to: null });
  });

  it("doesn't take a QR point as a destination", () => {
    expect(parseVenueQuery({ to: "Q2" }, places).to).toBeNull();
  });

  it("uses the first value when a parameter repeats", () => {
    expect(parseVenueQuery({ to: ["E-S1", "E-S2"] }, places).to).toBe("E-S1");
  });

  it("writes the route back as codes, leaving out the default start", () => {
    expect(venueQuery(byId("Q1"), byId("E-L2"))).toBe("?from=Q1&to=E-L2");
    expect(venueQuery(byId(DEFAULT_FROM), byId("W-S4"))).toBe("?to=W-S4");
    expect(venueQuery(byId(DEFAULT_FROM), null)).toBe("");
  });
});
