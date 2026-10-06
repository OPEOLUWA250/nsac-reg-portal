import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ client: vi.fn(), allowed: vi.fn(), role: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/server/admin-auth", () => ({ adminAuthClient: mocks.client }));
vi.mock("@/lib/server/rate-limit", () => ({ clientIp: () => "203.0.113.1", withinLimit: mocks.limit }));
vi.mock("@/lib/server/admin-emails", () => ({ isAllowedAdminEmail: mocks.allowed }));
vi.mock("@/lib/server/admin-roles", () => ({ resolveAdminRole: mocks.role }));

beforeEach(() => {
  mocks.client.mockResolvedValue({ auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut } });
  mocks.allowed.mockResolvedValue(true);
  mocks.role.mockResolvedValue("admin");
  mocks.signIn.mockResolvedValue({ data: { user: { app_metadata: { must_change_password: true } } }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.limit.mockResolvedValue(true);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

function request(body: unknown) {
  return new NextRequest("https://example.com/api/auth/login", { method: "POST", body: JSON.stringify(body) });
}

it.each([null, {}, { email: "a@example.com", password: "x".repeat(201) }])("refuses invalid input %#", async (body) => {
  const response = await POST(request(body));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "Incorrect email or password." });
  expect(mocks.signIn).not.toHaveBeenCalled();
});

it.each(["not allowed", "missing config", "offline", "wrong password", "not admin"])("uses the same refusal for %s", async (reason) => {
  if (reason === "not allowed") mocks.allowed.mockResolvedValue(false);
  if (reason === "missing config") mocks.client.mockResolvedValue(null);
  if (reason === "offline") mocks.signIn.mockRejectedValue(new Error("offline"));
  if (reason === "wrong password") mocks.signIn.mockResolvedValue({ data: { user: null }, error: { message: "bad credentials" } });
  if (reason === "not admin") mocks.role.mockResolvedValue(null);
  const response = await POST(request({ email: "admin@example.com", password: "temporary password" }));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "Incorrect email or password." });
  if (reason === "not admin") expect(mocks.signOut).toHaveBeenCalledOnce();
});

it("stops password guessing before trying the password", async () => {
  mocks.limit.mockImplementation(async (scope: string) => scope !== "login-email");
  const response = await POST(request({ email: "admin@example.com", password: "guess number 11" }));
  expect(response.status).toBe(429);
  expect(mocks.signIn).not.toHaveBeenCalled();
});

it("returns the temporary password requirement after successful sign-in", async () => {
  const response = await POST(request({ email: " ADMIN@example.com ", password: "temporary password" }));
  expect(await response.json()).toEqual({ ok: true, mustChangePassword: true });
  expect(mocks.signIn).toHaveBeenCalledWith({ email: "admin@example.com", password: "temporary password" });
  // Starts the inactivity clock.
  expect(response.headers.get("set-cookie")).toMatch(/^nsac_admin_activity=\d+\.\d+;.*HttpOnly/i);
});
