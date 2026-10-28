import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { logActivity } from "./activity-log";

const mocks = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: () => ({ from: () => ({ insert: mocks.insert }) }) }));

beforeEach(() => {
  mocks.insert.mockReset().mockResolvedValue({ error: null });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const req = new NextRequest("https://example.com/api/x", { headers: { "x-real-ip": "203.0.113.9" } });

it("records who did what, to what, and from where", async () => {
  await logActivity(
    { email: "ope@example.com", role: "super_admin" },
    { area: "registrations", action: "attendee.deleted", summary: "deleted Ada Obi's registration", target: { type: "attendee", id: "a1" }, details: { count: 1 } },
    req
  );
  expect(mocks.insert).toHaveBeenCalledWith({
    actor_email: "ope@example.com",
    actor_role: "super_admin",
    area: "registrations",
    action: "attendee.deleted",
    summary: "deleted Ada Obi's registration",
    target_type: "attendee",
    target_id: "a1",
    details: { count: 1 },
    ip: "203.0.113.9",
  });
});

it("never stops the action it records", async () => {
  mocks.insert.mockResolvedValue({ error: { code: "PGRST205", message: "no table" } });
  await expect(logActivity(null, { area: "settings", action: "x", summary: "did x" })).resolves.toBeUndefined();
  mocks.insert.mockRejectedValue(new Error("network down"));
  await expect(logActivity(null, { area: "settings", action: "x", summary: "did x" })).resolves.toBeUndefined();
});
