import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AdminSession } from "@/lib/server/admin-auth";
import { GET, POST } from "./route";

const mocks = vi.hoisted(() => ({ session: vi.fn(), rows: vi.fn(), log: vi.fn(), filters: [] as unknown[][] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/admin-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/admin-auth")>();
  return { ...actual, adminRoute: actual.createAdminRoute(mocks.session) };
});
vi.mock("@/lib/server/admin-emails", () => ({ ownerEmails: () => ["owner@example.com"] }));
vi.mock("@/lib/server/activity-log", () => ({ logActivity: mocks.log }));
// from("admin_activity").select().order().limit().lt/eq/ilike, awaited; from("admin_users").select(), awaited.
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => {
        if (table === "admin_users") return Promise.resolve({ data: [{ email: "Helper@Example.com" }], error: null });
        const chain = {
          order: () => chain,
          limit: () => chain,
          lt: (...a: unknown[]) => (mocks.filters.push(["lt", ...a]), chain),
          eq: (...a: unknown[]) => (mocks.filters.push(["eq", ...a]), chain),
          ilike: (...a: unknown[]) => (mocks.filters.push(["ilike", ...a]), chain),
          then: (resolve: (v: unknown) => unknown) => resolve(mocks.rows()),
        };
        return chain;
      },
    }),
  }),
}));

const superAdmin = { user: { id: "s" }, email: "owner@example.com", role: "super_admin", mustChangePassword: false } as AdminSession;
const row = (id: number) => ({ id, at: "2026-10-27T10:00:00Z", actor_email: "owner@example.com", area: "tickets", action: "ticket.updated", summary: "updated the Standard ticket", target_type: "ticket", target_id: "standard", details: null });

const get = (qs = "") => GET(new NextRequest(`https://example.com/api/admin/activity-log${qs}`), {});

beforeEach(() => {
  mocks.session.mockResolvedValue(superAdmin);
  mocks.rows.mockReturnValue({ data: Array.from({ length: 51 }, (_, i) => row(100 - i)), error: null });
  mocks.log.mockReset().mockResolvedValue(undefined);
  mocks.filters.length = 0;
});

it("pages the log, newest first, with everyone for the admin filter", async () => {
  const json = await (await get()).json();
  expect(json.entries).toHaveLength(50);
  expect(json.entries[0]).toMatchObject({ id: 100, actorEmail: "owner@example.com", area: "tickets", summary: "updated the Standard ticket" });
  expect(json.hasMore).toBe(true);
  expect(json.admins).toEqual(["helper@example.com", "owner@example.com"]);
});

it("filters by page, area, admin and words, dropping filter syntax from the search", async () => {
  await get("?before=60&area=tickets&actor=Owner@Example.com&q=50%25,off()");
  expect(mocks.filters).toEqual([
    ["lt", "id", 60],
    ["eq", "area", "tickets"],
    ["eq", "actor_email", "owner@example.com"],
    ["ilike", "summary", "%50  off%"],
  ]);
  mocks.filters.length = 0;
  await get("?area=nonsense");
  expect(mocks.filters).toEqual([]);
});

it("is for super admins only", async () => {
  mocks.session.mockResolvedValue({ ...superAdmin, role: "admin" });
  expect((await get()).status).toBe(403);
});

it("says when the table isn't set up", async () => {
  mocks.rows.mockReturnValue({ data: null, error: { code: "PGRST205", message: "missing" } });
  const res = await get();
  expect(res.status).toBe(503);
  expect((await res.json()).error).toMatch(/setup SQL/);
});

it("records a spreadsheet download by any admin", async () => {
  const admin = { ...superAdmin, role: "admin" } as AdminSession;
  mocks.session.mockResolvedValue(admin);
  const res = await POST(new NextRequest("https://example.com/api/admin/activity-log", { method: "POST", body: JSON.stringify({ kind: "export", what: "everyone", count: 134 }) }), {});
  expect(res.status).toBe(200);
  expect(mocks.log).toHaveBeenCalledWith(admin, expect.objectContaining({ summary: "downloaded 134 registrations as a spreadsheet (everyone)" }), expect.anything());
  const bad = await POST(new NextRequest("https://example.com/api/admin/activity-log", { method: "POST", body: JSON.stringify({ kind: "anything", what: "x", count: 1 }) }), {});
  expect(bad.status).toBe(400);
});
