import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  open: vi.fn(),
  rows: vi.fn(),
  prepare: vi.fn(),
  send: vi.fn(),
  record: vi.fn(),
  log: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/settings-store", () => ({ getSettings: mocks.settings }));
vi.mock("@/lib/registration-config", () => ({ isRegistrationOpen: mocks.open }));
vi.mock("@/lib/ticket-store", () => ({ listTickets: async () => [] }));
vi.mock("@/lib/ticket-image", () => ({ brandLogoPng: async () => null }));
vi.mock("@/lib/server/activity-log", () => ({ logActivity: mocks.log }));
vi.mock("@/lib/server/payment-reminders", () => ({
  missingColumn: (err: { code?: string }) => err?.code === "42703",
  prepareReminder: mocks.prepare,
  sendReminder: mocks.send,
  recordReminder: mocks.record,
}));
// from("attendees").select().eq().lte().is().order().limit(), awaited.
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: () => ({
    from: () => {
      const chain = { select: () => chain, eq: () => chain, lte: () => chain, is: () => chain, order: () => chain, limit: () => chain, then: (r: (v: unknown) => unknown) => r(mocks.rows()) };
      return chain;
    },
  }),
}));

const { GET } = await import("./route");
const call = (auth = "Bearer s3cret") => GET(new NextRequest("https://example.com/api/cron/payment-reminders", { headers: { authorization: auth } }));

beforeEach(() => {
  process.env.CRON_SECRET = "s3cret";
  process.env.PUBLIC_BASE_URL = "https://register.example.com";
  mocks.settings.mockResolvedValue({ autoReminders: { enabled: true, afterDays: 2, replyTo: null } });
  mocks.open.mockResolvedValue(true);
  mocks.rows.mockReturnValue({ data: [{ id: "a1", full_name: "Ada", email: "ada@example.com" }], error: null });
  mocks.prepare.mockResolvedValue({ ok: true, language: "en", email: {} });
  mocks.send.mockReset().mockResolvedValue(undefined);
  mocks.record.mockReset().mockResolvedValue({ id: "a1" });
  mocks.log.mockReset();
});

it("sends one reminder to each person due, and notes it", async () => {
  const json = await (await call()).json();
  expect(json).toEqual({ ok: true, sent: 1, failed: 0 });
  expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }), "automatic");
  expect(mocks.log).toHaveBeenCalledWith(null, expect.objectContaining({ summary: "sent an automatic payment reminder to Ada" }));
});

it("sends nothing without the cron secret, or when switched off", async () => {
  expect((await call("Bearer wrong")).status).toBe(401);
  delete process.env.CRON_SECRET;
  expect((await call()).status).toBe(503);
  process.env.CRON_SECRET = "s3cret";
  mocks.settings.mockResolvedValue({ autoReminders: { enabled: false, afterDays: 2, replyTo: null } });
  expect((await (await call()).json()).sent).toBe(0);
  expect(mocks.send).not.toHaveBeenCalled();
});

it("refuses to run before the reminder columns exist, so nobody is emailed every day", async () => {
  mocks.rows.mockReturnValue({ data: null, error: { code: "42703", message: "column does not exist" } });
  expect((await call()).status).toBe(503);
  expect(mocks.send).not.toHaveBeenCalled();
});

it("stops if a reminder can't be noted", async () => {
  mocks.rows.mockReturnValue({ data: [{ id: "a1", full_name: "Ada" }, { id: "a2", full_name: "Bo" }], error: null });
  mocks.record.mockResolvedValue(null);
  const json = await (await call()).json();
  expect(json.sent).toBe(1);
  expect(mocks.send).toHaveBeenCalledTimes(1);
});
