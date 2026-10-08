import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AdminSession } from "@/lib/server/admin-auth";
import { PATCH } from "./route";

const mocks = vi.hoisted(() => ({ session: vi.fn(), update: vi.fn(), read: vi.fn(), vip: vi.fn(), updates: [] as unknown[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/attendee-service", () => ({ sendVipNotice: mocks.vip }));
vi.mock("@/lib/server/admin-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/admin-auth")>();
  return { ...actual, adminRoute: actual.createAdminRoute(mocks.session) };
});
// update().eq().neq().select().maybeSingle() and select().eq().maybeSingle()
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: () => ({
    from: () => ({
      update: (values: unknown) => {
        mocks.updates.push(values);
        const chain = { eq: () => chain, neq: () => chain, select: () => chain, maybeSingle: mocks.update };
        return chain;
      },
      select: () => {
        const chain = { eq: () => chain, maybeSingle: mocks.read };
        return chain;
      },
    }),
  }),
}));

const session = { user: { id: "admin-id" }, email: "admin@example.com", role: "super_admin", mustChangePassword: false } as AdminSession;
const id = "12345678-1234-4234-8234-123456789abc";
const attendee = { id, role: "vip", payment_status: "paid", email: "ada@example.com" };

function patch(body: unknown) {
  return PATCH(new NextRequest("https://example.com/api/admin/attendees", { method: "PATCH", body: JSON.stringify(body) }), {});
}

beforeEach(() => {
  mocks.session.mockResolvedValue(session);
  mocks.update.mockResolvedValue({ data: attendee, error: null });
  mocks.read.mockResolvedValue({ data: attendee, error: null });
  mocks.vip.mockReset().mockResolvedValue(true);
  mocks.updates.length = 0;
});

describe("changing a registration category", () => {
  it("makes someone a VIP and emails them", async () => {
    const res = await patch({ id, role: "VIP", notify: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ changed: true, emailed: true });
    expect(mocks.updates).toEqual([{ role: "vip" }]);
    expect(mocks.vip).toHaveBeenCalledWith(attendee);
  });

  it("makes someone a VIP without an email when asked", async () => {
    expect(await (await patch({ id, role: "vip", notify: false })).json()).toMatchObject({ changed: true, emailed: false });
    expect(mocks.vip).not.toHaveBeenCalled();
  });

  it("doesn't email for other categories", async () => {
    mocks.update.mockResolvedValue({ data: { ...attendee, role: "speaker" }, error: null });
    await patch({ id, role: "speaker", notify: true });
    expect(mocks.vip).not.toHaveBeenCalled();
  });

  it("doesn't email again when they're already a VIP", async () => {
    mocks.update.mockResolvedValue({ data: null, error: null });
    expect(await (await patch({ id, role: "vip", notify: true })).json()).toMatchObject({ changed: false, emailed: false });
    expect(mocks.vip).not.toHaveBeenCalled();
  });

  it("rejects unknown categories and missing registrations", async () => {
    expect((await patch({ id, role: "king" })).status).toBe(400);
    expect((await patch({ id: "nope", role: "vip" })).status).toBe(400);
    mocks.update.mockResolvedValue({ data: null, error: null });
    mocks.read.mockResolvedValue({ data: null, error: null });
    expect((await patch({ id, role: "vip" })).status).toBe(404);
  });

  it("leaves VIPs to super admins", async () => {
    mocks.session.mockResolvedValue({ ...session, role: "admin" });
    expect((await patch({ id, role: "vip", notify: true })).status).toBe(403);
    expect(mocks.updates).toEqual([]);
    // Taking VIP away: the guarded update matches nothing, and the row is a VIP.
    mocks.update.mockResolvedValue({ data: null, error: null });
    expect((await patch({ id, role: "delegate" })).status).toBe(403);
    expect(mocks.vip).not.toHaveBeenCalled();
  });

  it("lets other admins change other categories", async () => {
    mocks.session.mockResolvedValue({ ...session, role: "admin" });
    mocks.update.mockResolvedValue({ data: { ...attendee, role: "speaker" }, error: null });
    expect((await patch({ id, role: "speaker" })).status).toBe(200);
  });

  it("is for signed-in admins only", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await patch({ id, role: "vip", notify: true })).status).toBe(401);
    expect(mocks.updates).toEqual([]);
  });
});
