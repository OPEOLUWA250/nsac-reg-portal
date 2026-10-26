import { describe, expect, it } from "vitest";
import { ENTRANCE } from "@/lib/venue/data";
import { buildPlaces } from "@/lib/venue/places";
import { route } from "@/lib/venue/pathfinding";
import { buildSteps } from "@/lib/venue/directions";

describe("venue directions", () => {
  it("takes you through the doorway into the North Room on the way to N-L4", () => {
    const places = buildPlaces();
    const from = places.find((p) => p.id === ENTRANCE.id)!;
    const to = places.find((p) => p.id === "N-L4")!;
    const steps = buildSteps(route(from.anchor, to.anchor)!, from, to, places);

    expect(steps[0].type).toBe("start");
    expect(steps.some((s) => /go through the doorway into the North Room/i.test(s.text))).toBe(true);
    expect(steps.at(-1)!.text).toMatch(/^Arrive at booth N-L4 (on your (left|right)|ahead of you)$/);
  });

  it("names an assigned booth by its exhibitor", () => {
    const places = buildPlaces({ "W-S4": { company: "Sahel Orbital", sector: "Earth observation", website: null } });
    const from = places.find((p) => p.id === "Q2")!;
    const to = places.find((p) => p.id === "W-S4")!;
    const steps = buildSteps(route(from.anchor, to.anchor)!, from, to, places);

    expect(to.name).toBe("Sahel Orbital");
    expect(steps.at(-1)!.text).toMatch(/^Arrive at Sahel Orbital \(W-S4\)/);
  });

  it("gives every step but the last a walking distance", () => {
    const places = buildPlaces();
    const from = places.find((p) => p.id === "Q5")!;
    const to = places.find((p) => p.id === "E-L2")!;
    const pts = route(from.anchor, to.anchor)!;
    const steps = buildSteps(pts, from, to, places);
    const sum = steps.reduce((a, s) => a + s.distanceM, 0);

    expect(steps.slice(0, -1).every((s) => s.distanceM > 0)).toBe(true);
    expect(sum).toBeGreaterThan(30);
  });
});
