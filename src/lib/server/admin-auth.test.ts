import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
import { createAdminRoute, type AdminSession } from "./admin-auth";
import { resolveAdminRole } from "./admin-roles";
import { isAllowedAdminEmail, parseAdminEmails } from "./admin-emails";
import {
  ADMIN_ACTIVITY_COOKIE,
  ADMIN_IDLE_LIMIT_MS,
  ADMIN_SESSION_MAX_MS,
  adminActivityCookie,
  adminActivityExpired,
  parseAdminActivity,
} from "./admin-idle";

const user = { id: "user-1", email: "Admin@Example.com", email_confirmed_at: "2026-09-30" };

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", "");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("admin roles", () => {
  it("normalizes owner lists and fails closed for missing configuration", () => {
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails('"A@example.com", b@example.com;\'C@example.com\'')).toEqual([
      "a@example.com", "b@example.com", "c@example.com",
    ]);
  });

  it("requires a confirmed email even for owners", async () => {
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
    const lookup = vi.fn();
    for (const candidate of [null, { ...user, email: undefined }, { ...user, email_confirmed_at: undefined }]) {
      expect(await resolveAdminRole(candidate, lookup)).toBeNull();
    }
    expect(lookup).not.toHaveBeenCalled();
    expect(await resolveAdminRole(user, lookup)).toBe("super_admin");
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each(["admin", "super_admin"])("resolves %s using both id and normalized email", async (role) => {
    const lookup = vi.fn().mockResolvedValue({ role });
    expect(await resolveAdminRole(user, lookup)).toBe(role);
    expect(lookup).toHaveBeenCalledWith({ id: user.id, email: "admin@example.com" });
  });

  it("rejects absent, invalid and unreachable database roles", async () => {
    expect(await resolveAdminRole(user, vi.fn().mockResolvedValue(null))).toBeNull();
    expect(await resolveAdminRole(user, vi.fn().mockResolvedValue({ role: "owner" }))).toBeNull();
    expect(await resolveAdminRole(user, vi.fn().mockRejectedValue(new Error("offline")))).toBeNull();
  });

  it("allows only owners or registered admin emails before login", async () => {
    const lookup = vi.fn().mockResolvedValue(true);
    expect(await isAllowedAdminEmail(" ADMIN@example.com ", lookup)).toBe(true);
    expect(lookup).toHaveBeenCalledWith("admin@example.com");
    expect(await isAllowedAdminEmail("other@example.com", vi.fn().mockResolvedValue(false))).toBe(false);
    expect(await isAllowedAdminEmail("other@example.com", vi.fn().mockRejectedValue(new Error("offline")))).toBe(false);
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
    expect(await isAllowedAdminEmail(user.email, vi.fn().mockRejectedValue(new Error("offline")))).toBe(true);
  });
});

describe("adminRoute", () => {
  const request = new NextRequest("https://example.com/api/admin/admins");
  const session: AdminSession = { user: user as User, email: "admin@example.com", role: "admin", mustChangePassword: false, signedInAt: 1_000 };

  it.each([
    [null, false, 401],
    [{ ...session, mustChangePassword: true }, false, 403],
    [{ ...session, role: "super_admin", mustChangePassword: true }, true, 403],
    [session, true, 403],
  ] as const)("blocks unauthorized access %#", async (value, superAdmin, status) => {
    const handler = vi.fn(() => new Response("allowed"));
    const response = await createAdminRoute(async () => value)(handler, { superAdmin })(request, {});
    expect(response.status).toBe(status);
    expect(handler).not.toHaveBeenCalled();
    if (value?.mustChangePassword) expect(await response.json()).toEqual({ error: "Set a new password before continuing." });
  });

  it.each([false, true])("passes request, context and authorized session to handler (super=%s)", async (superAdmin) => {
    const value = { ...session, role: superAdmin ? "super_admin" as const : "admin" as const };
    const handler = vi.fn(() => new Response("allowed"));
    const context = { params: Promise.resolve({}) };
    expect((await createAdminRoute(async () => value)(handler, { superAdmin })(request, context)).status).toBe(200);
    expect(handler).toHaveBeenCalledWith(request, context, value);
  });

  it("counts actions as activity but not reads", async () => {
    const route = createAdminRoute(async () => session)(async () => new Response("ok", { status: 201 }));
    const read = await route(request, {});
    expect(read.headers.get("set-cookie")).toBeNull();
    const action = await route(new NextRequest(request.url, { method: "POST" }), {});
    expect(action.status).toBe(201);
    expect(await action.text()).toBe("ok");
    expect(action.headers.get("set-cookie")).toMatch(new RegExp(`^${ADMIN_ACTIVITY_COOKIE}=1000\\.\\d+;`));
  });
});

describe("inactivity sign-out", () => {
  const hour = 60 * 60 * 1000;
  const now = 30 * 24 * hour;

  it("reads only well-formed activity cookies", () => {
    expect(parseAdminActivity("100.200")).toEqual({ signedInAt: 100, lastActiveAt: 200 });
    for (const bad of [undefined, "", "100", "a.b", "100.200.300", "-1.2"]) expect(parseAdminActivity(bad)).toBeNull();
  });

  it("expires after the idle limit, after the maximum session, or with no record", () => {
    const fresh = { signedInAt: now - hour, lastActiveAt: now - hour };
    expect(adminActivityExpired(fresh, now)).toBe(false);
    expect(adminActivityExpired({ ...fresh, lastActiveAt: now - ADMIN_IDLE_LIMIT_MS + 1 }, now)).toBe(false);
    expect(adminActivityExpired({ ...fresh, lastActiveAt: now - ADMIN_IDLE_LIMIT_MS - 1 }, now)).toBe(true);
    expect(adminActivityExpired({ signedInAt: now - ADMIN_SESSION_MAX_MS - 1, lastActiveAt: now }, now)).toBe(true);
    expect(adminActivityExpired(null, now)).toBe(true);
  });

  it("writes an HttpOnly cookie that keeps the sign-in time", () => {
    expect(adminActivityCookie(100, 200)).toMatchObject({ name: ADMIN_ACTIVITY_COOKIE, value: "100.200", httpOnly: true, path: "/" });
  });
});
