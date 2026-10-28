import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AdminSession } from "@/lib/server/admin-auth";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ session: vi.fn(), events: vi.fn(), recent: vi.fn(), gte: [] as unknown[][] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/admin-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/admin-auth")>();
  return { ...actual, adminRoute: actual.createAdminRoute(mocks.session) };
});
// from("admin_activity").select(cols).gte?().order().limit(), awaited. The
// columns tell the two queries apart: events have no summary.
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: (cols: string) => {
        const chain = {
          gte: (...a: unknown[]) => (mocks.gte.push(a), chain),
          order: () => chain,
          limit: () => chain,
          then: (resolve: (v: unknown) => unknown) => resolve(cols.includes("summary") ? mocks.recent() : mocks.events()),
        };
        return chain;
      },
    }),
  }),
}));

const superAdmin = { user: { id: "s" }, email: "owner@example.com", role: "super_admin", mustChangePassword: false } as AdminSession;
const get = () => GET(new NextRequest("https://example.com/api/admin/analytics/activity"), {});

beforeEach(() => {
  mocks.session.mockResolvedValue(superAdmin);
  mocks.events.mockReturnValue({
    data: [
      { at: "2026-10-27T10:00:00Z", actor_email: "owner@example.com", area: "tickets" },
      { at: "2026-10-26T09:00:00Z", actor_email: null, area: "something_new" },
    ],
    error: null,
  });
  mocks.recent.mockReturnValue({
    data: [{ id: 7, at: "2026-10-27T10:00:00Z", actor_email: "owner@example.com", area: "tickets", summary: "updated the Standard ticket" }],
    error: null,
  });
  mocks.gte.length = 0;
});

it("returns the last 90 days of actions and the latest entries", async () => {
  const json = await (await get()).json();
  expect(json.events).toEqual([
    { at: "2026-10-27T10:00:00Z", actor: "owner@example.com", area: "tickets" },
    { at: "2026-10-26T09:00:00Z", actor: null, area: "settings" },
  ]);
  expect(json.truncated).toBe(false);
  expect(json.recent).toEqual([{ id: 7, at: "2026-10-27T10:00:00Z", actorEmail: "owner@example.com", area: "tickets", summary: "updated the Standard ticket" }]);
  const [[column, since]] = mocks.gte as [string, string][];
  expect(column).toBe("at");
  expect(Date.now() - new Date(since).getTime()).toBeCloseTo(90 * 24 * 3600_000, -5);
});

it("is for super admins only", async () => {
  mocks.session.mockResolvedValue({ ...superAdmin, role: "admin" });
  expect((await get()).status).toBe(403);
});

it("says when the table isn't set up", async () => {
  mocks.events.mockReturnValue({ data: null, error: { code: "PGRST205", message: "missing" } });
  const res = await get();
  expect(res.status).toBe(503);
  expect((await res.json()).error).toMatch(/setup SQL/);
});
