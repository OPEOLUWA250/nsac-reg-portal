import { describe, expect, it } from "vitest";
import { boothCode, parseBoothAssignment, webAddress } from "@/lib/venue/booth-fields";

describe("booth assignment fields", () => {
  it("accepts a booth by its printed code, in any case, hyphen optional", () => {
    expect(boothCode("W-S4")).toBe("W-S4");
    expect(boothCode("ws4")).toBe("W-S4");
    expect(boothCode("m1")).toBe("M-1");
    expect(boothCode("W-S99")).toBeNull();
    expect(boothCode(42)).toBeNull();
  });

  it("cleans up what an admin typed", () => {
    const r = parseBoothAssignment({ boothCode: "ws4", companyName: "  Sahel   Orbital ", sector: "", website: "sahelorbital.com", logoUrl: "" });
    expect(r).toEqual({
      value: { boothCode: "W-S4", status: "sold", companyName: "Sahel Orbital", sector: null, website: "https://sahelorbital.com/", logoUrl: null },
    });
  });

  it("needs a real booth and a company name", () => {
    const r = parseBoothAssignment({ boothCode: "X-1", companyName: " " });
    expect(r).toEqual({ fields: { boothCode: expect.any(String), companyName: expect.any(String) } });
  });

  it("refuses links that aren't web addresses", () => {
    expect(webAddress("javascript:alert(1)")).toBeNull();
    expect(webAddress("ftp://example.com")).toBeNull();
    expect(webAddress("not a site")).toBeNull();
    expect(webAddress("http://example.com/logo.png")).toBe("http://example.com/logo.png");
    const r = parseBoothAssignment({ boothCode: "E-L2", companyName: "Acme", website: "javascript:alert(1)", logoUrl: "nope" });
    expect(r).toEqual({ fields: { website: expect.any(String), logoUrl: expect.any(String) } });
  });

  it("holds a booth as reserved, and refuses any other status", () => {
    expect(parseBoothAssignment({ boothCode: "N-L4", status: "reserved", companyName: "Acme" })).toMatchObject({ value: { status: "reserved" } });
    expect(parseBoothAssignment({ boothCode: "N-L4", status: "maybe", companyName: "Acme" })).toEqual({ fields: { status: expect.any(String) } });
  });

  it("limits the length of names", () => {
    const r = parseBoothAssignment({ boothCode: "E-L2", companyName: "A".repeat(121), sector: "B".repeat(81) });
    expect(r).toEqual({ fields: { companyName: expect.any(String), sector: expect.any(String) } });
  });
});
