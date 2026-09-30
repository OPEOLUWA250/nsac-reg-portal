import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "./proxy";

const mocks = vi.hoisted(() => ({ create: vi.fn(), getUser: vi.fn(), role: vi.fn(), config: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.create }));
vi.mock("@/lib/server/admin-roles", () => ({ resolveAdminRole: mocks.role, supabaseAuthConfig: mocks.config }));

beforeEach(() => {
  mocks.config.mockReturnValue({ url: "https://example.supabase.co", anonKey: "public-key" });
  mocks.create.mockImplementation((_url, _key, options) => {
    options.cookies.setAll([{ name: "session", value: "refreshed", options: { httpOnly: true, path: "/" } }]);
    return { auth: { getUser: mocks.getUser } };
  });
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  mocks.role.mockResolvedValue(null);
});
afterEach(() => vi.restoreAllMocks());

it("redirects signed-out requests, preserving destination and refreshed cookies", async () => {
  const response = await proxy(new NextRequest("https://example.com/admin/tickets?filter=active"));
  const destination = new URL(response.headers.get("location")!);
  expect(destination.pathname).toBe("/admin/login");
  expect(destination.searchParams.get("next")).toBe("/admin/tickets?filter=active");
  expect(response.cookies.get("session")?.value).toBe("refreshed");
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
    expect((await proxy(new NextRequest(`https://example.com${path}`))).headers.get("location")).toBe("https://example.com/admin/reset-password");
  }
  expect((await proxy(new NextRequest("https://example.com/admin/reset-password"))).status).toBe(200);
});

it("sends signed-in admins away from login", async () => {
  mocks.role.mockResolvedValue("admin");
  mocks.getUser.mockResolvedValue({ data: { user: { app_metadata: {} } } });
  expect((await proxy(new NextRequest("https://example.com/admin/login"))).headers.get("location")).toBe("https://example.com/admin");
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
  expect((await proxy(new NextRequest("https://example.com/checkin"))).status).toBe(200);
});
