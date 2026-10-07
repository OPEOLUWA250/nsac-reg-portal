import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "./proxy";
import { ADMIN_ACTIVITY_COOKIE, ADMIN_IDLE_LIMIT_MS } from "@/lib/server/admin-idle";

const mocks = vi.hoisted(() => ({ create: vi.fn(), getUser: vi.fn(), signOut: vi.fn(), role: vi.fn(), config: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.create }));
vi.mock("@/lib/server/admin-roles", () => ({ resolveAdminRole: mocks.role, supabaseAuthConfig: mocks.config, ADMIN_COOKIE_OPTIONS: { httpOnly: true, path: "/" } }));

beforeEach(() => {
  mocks.config.mockReturnValue({ url: "https://example.supabase.co", anonKey: "public-key" });
  mocks.create.mockImplementation((_url, _key, options) => {
    options.cookies.setAll([{ name: "session", value: "refreshed", options: { httpOnly: true, path: "/" } }]);
    return { auth: { getUser: mocks.getUser, signOut: mocks.signOut } };
  });
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.role.mockResolvedValue(null);
});
afterEach(() => vi.restoreAllMocks());

const HOUR = 60 * 60 * 1000;

// A request from a browser last active `idleFor` ago.
function signedIn(path: string, idleFor = 0, headers: Record<string, string> = {}) {
  const now = Date.now();
  return new NextRequest(`https://example.com${path}`, {
    headers: { cookie: `${ADMIN_ACTIVITY_COOKIE}=${now - HOUR - idleFor}.${now - idleFor}`, ...headers },
  });
}

it("redirects signed-out requests, preserving destination and refreshed cookies", async () => {
  const response = await proxy(new NextRequest("https://example.com/admin/tickets?filter=active"));
  const destination = new URL(response.headers.get("location")!);
  expect(destination.pathname).toBe("/admin/login");
  expect(destination.searchParams.get("next")).toBe("/admin/tickets?filter=active");
  expect(response.cookies.get("session")?.value).toBe("refreshed");
});

it("keeps session cookies away from page scripts", async () => {
  await proxy(new NextRequest("https://example.com/admin"));
  expect(mocks.create.mock.calls[0][2].cookieOptions).toMatchObject({ httpOnly: true });
});

it.each(["missing", "invalid", "offline"])("treats %s auth configuration as signed out", async (mode) => {
  if (mode === "missing") mocks.config.mockReturnValue(null);
  if (mode === "invalid") mocks.create.mockImplementation(() => { throw new Error("invalid URL"); });
  if (mode === "offline") mocks.getUser.mockRejectedValue(new Error("offline"));
  expect((await proxy(new NextRequest("https://example.com/admin"))).status).toBe(307);
  expect((await proxy(new NextRequest("https://example.com/admin/login"))).status).toBe(200);
});

it("allows temporary-password admins only onto the reset page", async () => {
  mocks.role.mockResolvedValue("admin");
  mocks.getUser.mockResolvedValue({ data: { user: { app_metadata: { must_change_password: true } } } });
  for (const path of ["/admin", "/admin/login", "/admin/admins", "/checkin"]) {
    expect((await proxy(signedIn(path))).headers.get("location")).toBe("https://example.com/admin/reset-password");
  }
  expect((await proxy(signedIn("/admin/reset-password"))).status).toBe(200);
});

it("sends signed-in admins away from login", async () => {
  mocks.role.mockResolvedValue("admin");
  mocks.getUser.mockResolvedValue({ data: { user: { app_metadata: {} } } });
  expect((await proxy(signedIn("/admin/login"))).headers.get("location")).toBe("https://example.com/admin");
});

it("protects the scanner and preserves its destination for login", async () => {
  expect(config.matcher).toContain("/checkin/:path*");
  const response = await proxy(new NextRequest("https://example.com/checkin"));
  const destination = new URL(response.headers.get("location")!);
  expect(destination.pathname).toBe("/admin/login");
  expect(destination.searchParams.get("next")).toBe("/checkin");
});

it.each(["admin", "super_admin"])("lets signed-in %s accounts use the scanner", async (role) => {
  mocks.role.mockResolvedValue(role);
  mocks.getUser.mockResolvedValue({ data: { user: { app_metadata: {} } } });
  expect((await proxy(signedIn("/checkin"))).status).toBe(200);
});

it("counts page loads as activity, but not prefetches", async () => {
  mocks.role.mockResolvedValue("admin");
  mocks.getUser.mockResolvedValue({ data: { user: { app_metadata: {} } } });
  const before = Date.now();
  const response = await proxy(signedIn("/admin", HOUR));
  const [signedInAt, lastActiveAt] = response.cookies.get(ADMIN_ACTIVITY_COOKIE)!.value.split(".").map(Number);
  expect(lastActiveAt).toBeGreaterThanOrEqual(before);
  expect(before - signedInAt).toBeGreaterThanOrEqual(2 * HOUR); // the sign-in time is kept
  const prefetch = await proxy(signedIn("/admin", HOUR, { "next-router-prefetch": "1" }));
  expect(prefetch.status).toBe(200);
  expect(prefetch.cookies.get(ADMIN_ACTIVITY_COOKIE)).toBeUndefined();
});

it.each([
  ["inactive too long", ADMIN_IDLE_LIMIT_MS + 1000],
  ["without an activity record", null],
] as const)("signs out admins %s", async (_case, idleFor) => {
  mocks.role.mockResolvedValue("admin");
  mocks.getUser.mockResolvedValue({ data: { user: { app_metadata: {} } } });
  for (const path of ["/admin/tickets", "/checkin"]) {
    mocks.signOut.mockClear();
    const request = idleFor === null ? new NextRequest(`https://example.com${path}`) : signedIn(path, idleFor);
    const response = await proxy(request);
    const destination = new URL(response.headers.get("location")!);
    expect(destination.pathname).toBe("/admin/login");
    expect(destination.searchParams.get("next")).toBe(path);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.cookies.get(ADMIN_ACTIVITY_COOKIE)?.value).toBe("");
  }
  // On the sign-in page itself: signed out, and the page shows.
  const login = await proxy(idleFor === null ? new NextRequest("https://example.com/admin/login") : signedIn("/admin/login", idleFor));
  expect(login.status).toBe(200);
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
});

it("clears the session itself when Supabase can't sign out", async () => {
  mocks.role.mockResolvedValue("admin");
  mocks.getUser.mockResolvedValue({ data: { user: { app_metadata: {} } } });
  mocks.signOut.mockRejectedValue(new Error("offline"));
  const cookie = "sb-ref-auth-token.0=chunk; sb-ref-auth-token.1=chunk";
  const response = await proxy(new NextRequest("https://example.com/admin", { headers: { cookie } }));
  expect(response.cookies.get("sb-ref-auth-token.0")?.value).toBe("");
  expect(response.cookies.get("sb-ref-auth-token.1")?.value).toBe("");
  const login = await proxy(new NextRequest("https://example.com/admin/login", { headers: { cookie } }));
  expect(login.status).toBe(200);
});
