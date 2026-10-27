import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AdminSession } from "@/lib/server/admin-auth";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ session: vi.fn(), update: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/admin-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/admin-auth")>();
  return { ...actual, adminRoute: actual.createAdminRoute(mocks.session) };
});
vi.mock("@/lib/settings-store", () => ({ getSettings: vi.fn(), updateSettings: mocks.update }));
vi.mock("@/lib/ticket-store", () => ({ availableTickets: vi.fn() }));
vi.mock("@/lib/server/activity-log", () => ({ logActivity: vi.fn() }));

const superAdmin = { user: { id: "s" }, email: "owner@example.com", role: "super_admin", mustChangePassword: false } as AdminSession;
const admin = { ...superAdmin, email: "admin@example.com", role: "admin" } as AdminSession;

function post(body: unknown) {
  return POST(new NextRequest("https://example.com/api/admin/settings", { method: "POST", body: JSON.stringify(body) }), {});
}

beforeEach(() => {
  mocks.update.mockReset();
  mocks.update.mockImplementation(async (patch: { alertEmails?: string[] }) => ({ registrationOpen: true, alertEmails: patch.alertEmails ?? [] }));
});

it("lets a super admin save the registration alert list, cleaned up", async () => {
  mocks.session.mockResolvedValue(superAdmin);
  const response = await post({ alertEmails: ["Team@SpaceInAfrica.com", "team@spaceinafrica.com", "finance@spaceinafrica.com"] });
  expect(response.status).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith({ registrationOpen: undefined, alertEmails: ["team@spaceinafrica.com", "finance@spaceinafrica.com"] });
  expect(await response.json()).toMatchObject({ settings: { alertEmails: ["team@spaceinafrica.com", "finance@spaceinafrica.com"] } });
});

it("doesn't let other admins change who gets registrants' details", async () => {
  mocks.session.mockResolvedValue(admin);
  const response = await post({ alertEmails: ["me@example.com"] });
  expect(response.status).toBe(403);
  expect(mocks.update).not.toHaveBeenCalled();
});

it("still lets other admins open and close registration", async () => {
  mocks.session.mockResolvedValue(admin);
  const response = await post({ registrationOpen: false });
  expect(response.status).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith({ registrationOpen: false, alertEmails: undefined });
});

it.each([[["not-an-email"]], ["team@example.com"], [Array.from({ length: 21 }, (_, i) => `p${i}@example.com`)]])(
  "refuses an alert list that isn't up to 20 email addresses: %j",
  async (alertEmails) => {
    mocks.session.mockResolvedValue(superAdmin);
    const response = await post({ alertEmails });
    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  }
);
