import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AdminSession } from "@/lib/server/admin-auth";
import { POST as lookup } from "./lookup/route";
import { POST as confirm } from "./confirm/route";
import { POST as printed } from "./badge-printed/route";
import { POST as verify } from "../staff/verify/route";

const mocks = vi.hoisted(() => ({ session: vi.fn(), db: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: mocks.db }));
vi.mock("@/lib/server/admin-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/admin-auth")>();
  return { ...actual, adminRoute: actual.createAdminRoute(mocks.session) };
});

beforeEach(() => { mocks.session.mockResolvedValue(null); });
afterEach(() => vi.unstubAllEnvs());

const session = { user: { id: "admin-id" }, email: "admin@example.com", role: "admin", mustChangePassword: false } as AdminSession;

describe.each([["lookup", lookup], ["confirm", confirm], ["badge-printed", printed], ["staff/verify", verify]] as const)("scanner endpoint %s", (_name, handler) => {
  function request() {
    return new NextRequest("https://example.com/api/checkin", { method: "POST", headers: { "x-staff-code": "old-code" }, body: "{}" });
  }

  it.each(["", "old-code"])("rejects unauthenticated callers even with legacy staff setting %s", async (code) => {
    vi.stubEnv("STAFF_ACCESS_CODE", code);
    expect((await handler(request(), {})).status).toBe(401);
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it("blocks admins who still need to change their temporary password", async () => {
    mocks.session.mockResolvedValue({ ...session, mustChangePassword: true });
    expect((await handler(request(), {})).status).toBe(403);
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it.each(["admin", "super_admin"])("allows %s through to request validation", async (role) => {
    mocks.session.mockResolvedValue({ ...session, role });
    expect((await handler(request(), {})).status).toBe(handler === verify ? 200 : 400);
  });
});
