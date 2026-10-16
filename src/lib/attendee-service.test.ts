import { beforeEach, expect, it, vi } from "vitest";
import type { Attendee } from "./types";

const mocks = vi.hoisted(() => ({ send: vi.fn(), admins: vi.fn(), settings: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendAdminRegistrationEmail: mocks.send, sendQrEmail: vi.fn(), sendCategoryChangeEmail: vi.fn() }));
vi.mock("@/lib/server/admin-emails", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/admin-emails")>()),
  currentAdminEmails: mocks.admins,
}));
vi.mock("@/lib/settings-store", () => ({ getSettings: mocks.settings }));
vi.mock("@/lib/ticket-store", () => ({ listTickets: async () => [{ id: "standard", name: { en: "Standard", fr: "Standard" } }] }));
vi.mock("@/lib/ticket-image", () => ({ brandLogoPng: async () => null, renderTicketPng: vi.fn() }));
vi.mock("@/lib/public-url", () => ({ publicBaseUrl: () => "https://event.example.com" }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: () => ({}) }));
import { notifyAdminsOfRegistration } from "./attendee-service";

const attendee = { id: "a1", full_name: "Ada Example", ticket_type: "standard", passport_path: null } as unknown as Attendee;

beforeEach(() => {
  vi.stubEnv("ADMIN_NOTIFY_EMAILS", "owner@spaceinafrica.com");
  mocks.send.mockReset().mockResolvedValue(undefined);
  mocks.admins.mockResolvedValue(new Set(["owner@spaceinafrica.com", "ops@spaceinafrica.com"]));
  mocks.settings.mockResolvedValue({ registrationOpen: true, alertEmails: ["ops@spaceinafrica.com", "finance@spaceinafrica.com", "owner@spaceinafrica.com"] });
});

it("sends everyone their own copy, with the dashboard button only for admins", async () => {
  await notifyAdminsOfRegistration(attendee);
  const sent = Object.fromEntries(mocks.send.mock.calls.map(([args]) => [args.to, args.dashboardUrl]));
  expect(sent).toEqual({
    "owner@spaceinafrica.com": "https://event.example.com/admin",
    "ops@spaceinafrica.com": "https://event.example.com/admin",
    "finance@spaceinafrica.com": null,
  });
  expect(mocks.send.mock.calls[0][0]).toMatchObject({ attendee, ticketName: "Standard", passportUploaded: false });
});

it("gives the button once someone becomes an admin, checked at sending time", async () => {
  mocks.admins.mockResolvedValue(new Set(["owner@spaceinafrica.com", "ops@spaceinafrica.com", "finance@spaceinafrica.com"]));
  await notifyAdminsOfRegistration(attendee);
  expect(mocks.send.mock.calls.every(([args]) => args.dashboardUrl === "https://event.example.com/admin")).toBe(true);
});

it("still emails the others when one address fails, and never throws", async () => {
  mocks.send.mockImplementation(async ({ to }: { to: string }) => {
    if (to === "ops@spaceinafrica.com") throw new Error("mailbox unavailable");
  });
  await expect(notifyAdminsOfRegistration(attendee)).resolves.toBeUndefined();
  expect(mocks.send).toHaveBeenCalledTimes(3);
});

it("sends nothing when nobody is on either list", async () => {
  vi.stubEnv("ADMIN_NOTIFY_EMAILS", "");
  mocks.settings.mockResolvedValue({ registrationOpen: true, alertEmails: [] });
  await notifyAdminsOfRegistration(attendee);
  expect(mocks.send).not.toHaveBeenCalled();
});
